// @ts-check
const crypto = require(`crypto`)
const path = require(`path`)
const fs = require(`fs-extra`)
const { fetchRemoteFile } = require(`gatsby-core-utils`)
const svgToMiniDataURI = require('mini-svg-data-uri')
const { default: PQueue } = require('p-queue')
const { optimize } = require('svgo')

const queue = new PQueue({
  concurrency: 5
})
const defaultSVGOOptions = {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          removeViewBox: false
        }
      }
    },
    'cleanupListOfValues',
    'prefixIds',
    'removeDimensions',
    'removeOffCanvasPaths',
    'removeRasterImages',
    'removeScriptElement',
    'convertStyleToAttrs',
    'removeStyleElement',
    'reusePaths',
    'sortAttrs'
  ]
}

// do we really need this? :(
const sessionCache = {}

exports.createSchemaCustomization = ({ actions }) => {
  actions.createTypes(`
    type InlineSvg {
      content: String
      originalContent: String
      dataURI: String
      absolutePath: String
      relativePath: String
    }
  `)
}

async function processSVG({ absolutePath, store, reporter }) {
  // Read local file
  const svg = await fs.readFile(absolutePath, 'utf8')

  // Optimize
  if (svg.indexOf('base64') !== -1) {
    reporter.info(
      `${absolutePath}:\nSVG contains pixel data. Pixel data was removed to avoid file size bloat.`
    )
  }

  // @ts-ignore
  const result = optimize(svg.toString(), {
    ...defaultSVGOOptions,
    path: absolutePath
  })

  if ('data' in result) {
    // Create mini data URI
    const dataURI = svgToMiniDataURI(result.data)
    const directory = store.getState().program.directory

    return {
      content: result.data,
      originalContent: svg,
      dataURI,
      absolutePath,
      relativePath: path.relative(directory, absolutePath)
    }
  }

  if ('modernError' in result) {
    console.error(result.error)
    throw result.modernError
  }

  throw new Error(
    `SVGO returned an invalid result:\n${JSON.stringify(result, null, 2)}`
  )
}

async function queueSVG({ provider, absolutePath, cache, store, reporter }) {
  const cacheId =
    `${provider}-svg-content-` +
    crypto.createHash(`md5`).update(absolutePath).digest(`hex`)
  if (sessionCache[cacheId]) {
    return sessionCache[cacheId]
  }

  return queue.add(async () => {
    try {
      if (sessionCache[cacheId]) {
        return sessionCache[cacheId]
      }
      const cachedData = await cache.get(cacheId)

      if (cachedData) {
        return cachedData
      }

      const processPromise = processSVG({
        absolutePath,
        store,
        reporter
      })

      sessionCache[cacheId] = processPromise

      const result = await processPromise

      await cache.set(cacheId, result)

      return result
    } catch (err) {
      reporter.panic(err)
      return null
    }
  })
}

exports.createResolvers = ({ cache, createResolvers, store, reporter }) => {
  createResolvers(
    {
      File: {
        svg: {
          type: `InlineSvg`,
          resolve: async (source) => {
            const { absolutePath } = source
            const provider = 'file'

            // Ensure to process only svgs
            if (source.internal.mediaType !== 'image/svg+xml') {
              return null
            }

            return queueSVG({ provider, absolutePath, store, reporter, cache })
          }
        }
      },
      ContentfulAsset: {
        svg: {
          type: `InlineSvg`,
          resolve: async (source) => {
            // Catch empty Contentful assets
            if (!source.file) {
              return null
            }

            const {
              file: { url, contentType }
            } = source
            const provider = 'contentful'

            // Ensure to process only svgs and files with an url
            if (contentType !== 'image/svg+xml' || !url) {
              return null
            }

            // Get remote file
            const absolutePath = await fetchRemoteFile({
              url: `https:${url}#${source.updatedAt}`,
              cache
            })

            return queueSVG({ provider, absolutePath, store, reporter, cache })
          }
        }
      },
      DatoCmsAsset: {
        svg: {
          type: `InlineSvg`,
          resolve: async (source) => {
            // Catch empty DatoCMS assets
            if (!source.entityPayload) {
              return null
            }

            const {
              entityPayload: {
                attributes: { url, mime_type }
              },
              internal: { contentDigest: cacheKey }
            } = source
            const provider = 'dato-cms'

            // Ensure to process only svgs and files with an url
            if (mime_type !== 'image/svg+xml' || !url) {
              return null
            }

            // Get remote file
            const absolutePath = await fetchRemoteFile({
              url,
              cacheKey,
              cache
            })

            return queueSVG({ provider, absolutePath, store, reporter, cache })
          }
        }
      }
    },
    {
      // Surpress warnings for missing content sources
      ignoreNonexistentTypes: true
    }
  )
}
