// @ts-check
const crypto = require(`crypto`)
const path = require(`path`)
const fs = require(`fs-extra`)
const { fetchRemoteFile } = require(`gatsby-core-utils`)
const svgToMiniDataURI = require('mini-svg-data-uri')
const { default: PQueue } = require('p-queue')
const SVGO = require('svgo')

const queue = new PQueue({
  concurrency: 5
})
const svgo = new SVGO({
  multipass: true,
  floatPrecision: 2,
  plugins: [
    { removeDoctype: true },
    { removeXMLProcInst: true },
    { removeComments: true },
    { removeMetadata: true },
    { removeXMLNS: false },
    { removeEditorsNSData: true },
    { cleanupAttrs: true },
    { inlineStyles: true },
    { minifyStyles: true },
    { convertStyleToAttrs: true },
    { cleanupIDs: true },
    { prefixIds: true },
    { removeRasterImages: true },
    { removeUselessDefs: true },
    { cleanupNumericValues: true },
    { cleanupListOfValues: true },
    { convertColors: true },
    { removeUnknownsAndDefaults: true },
    { removeNonInheritableGroupAttrs: true },
    { removeUselessStrokeAndFill: true },
    { removeViewBox: false },
    { cleanupEnableBackground: true },
    { removeHiddenElems: true },
    { removeEmptyText: true },
    { convertShapeToPath: true },
    { moveElemsAttrsToGroup: true },
    { moveGroupAttrsToElems: true },
    { collapseGroups: true },
    { convertPathData: true },
    { convertTransform: true },
    { removeEmptyAttrs: true },
    { removeEmptyContainers: true },
    { mergePaths: true },
    { removeUnusedNS: true },
    { sortAttrs: true },
    { removeTitle: true },
    { removeDesc: true },
    { removeDimensions: true },
    { removeAttrs: false },
    { removeAttributesBySelector: false },
    { removeElementsByAttr: false },
    { addClassesToSVGElement: false },
    { removeStyleElement: false },
    { removeScriptElement: false },
    { addAttributesToSVGElement: false },
    { removeOffCanvasPaths: true },
    { reusePaths: false }
  ]
})

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
  const { data: optimizedSVG } = await svgo.optimize(svg, {
    path: absolutePath
  })

  // Create mini data URI
  const dataURI = svgToMiniDataURI(optimizedSVG)
  const directory = store.getState().program.directory

  return {
    content: optimizedSVG,
    originalContent: svg,
    dataURI,
    absolutePath,
    relativePath: path.relative(directory, absolutePath)
  }
}

async function queueSVG({ absolutePath, cache, store, reporter }) {
  const cacheId =
    'contentful-svg-content-' +
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
  createResolvers({
    File: {
      svg: {
        type: `InlineSvg`,
        resolve: async (source) => {
          const { absolutePath } = source

          // Ensure to process only svgs
          if (source.internal.mediaType !== 'image/svg+xml') {
            return null
          }

          return queueSVG({ absolutePath, store, reporter, cache })
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

          // Ensure to process only svgs and files with an url
          if (contentType !== 'image/svg+xml' || !url) {
            return null
          }

          // Get remote file
          const absolutePath = await fetchRemoteFile({
            url: `https:${url}#${source.updatedAt}`,
            cache
          })

          return queueSVG({ absolutePath, store, reporter, cache })
        }
      }
    }
  })
}
