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

exports.pluginOptionsSchema = ({ Joi }) => {
  return Joi.object({
    multipass: Joi.boolean()
      .default(true)
      .description(
        `Pass over SVGs multiple times to ensure all optimizations are applied. boolean. true by default`
      ),
    floatPrecision: Joi.number()
      .default(2)
      .description(
        `Set number of digits in the fractional part, overrides plugins params`
      ),
    // plugins is a reserved props
    features: Joi.array()
      .items(
        Joi.string().valid(
          'cleanupAttrs',
          'mergeStyles',
          'inlineStyles',
          'removeDoctype',
          'removeXMLProcInst',
          'removeComments',
          'removeMetadata',
          'removeTitle',
          'removeDesc',
          'removeUselessDefs',
          'removeXMLNS',
          'removeEditorsNSData',
          'removeEmptyAttrs',
          'removeHiddenElems',
          'removeEmptyText',
          'removeEmptyContainers',
          'removeViewBox',
          'cleanupEnableBackground',
          'minifyStyles',
          'convertStyleToAttrs',
          'convertColors',
          'convertPathData',
          'convertTransform',
          'removeUnknownsAndDefaults',
          'removeNonInheritableGroupAttrs',
          'removeUselessStrokeAndFill',
          'removeUnusedNS',
          'prefixIds',
          'cleanupIds',
          'cleanupNumericValues',
          'cleanupListOfValues',
          'moveElemsAttrsToGroup',
          'moveGroupAttrsToElems',
          'collapseGroups',
          'removeRasterImages',
          'mergePaths',
          'convertShapeToPath',
          'convertEllipseToCircle',
          'sortAttrs',
          'sortDefsChildren',
          'removeDimensions',
          'removeAttrs',
          'removeAttributesBySelector',
          'removeElementsByAttr',
          'addClassesToSVGElement',
          'addAttributesToSVGElement',
          'removeOffCanvasPaths',
          'removeStyleElement',
          'removeScriptElement',
          'reusePaths'
        ),
        Joi.object({
          name: Joi.string().description(`name of plugins`),
          params: Joi.object().description(`additional plugins params options`)
        })
      )
      .min(0)
      .default(defaultSVGOOptions.plugins)
      .description(`Set SVGO features/plugins`)
  })
}

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

async function processSVG({ absolutePath, store, reporter, svgomgOpts }) {
  // Read local file
  const svg = await fs.readFile(absolutePath, 'utf8')

  // Optimize
  if (svg.indexOf('base64') !== -1) {
    reporter.info(
      `${absolutePath}:\nSVG contains pixel data. Pixel data was removed to avoid file size bloat.`
    )
  }

  const { multipass, floatPrecision, features: plugins } = svgomgOpts || {}

  const svgopts = svgomgOpts
    ? {
        multipass,
        floatPrecision,
        plugins
      }
    : defaultSVGOOptions

  // @ts-ignore
  const result = optimize(svg.toString(), {
    ...svgopts,
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

async function queueSVG({ absolutePath, cache, store, reporter, svgomgOpts }) {
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
        reporter,
        svgomgOpts
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

exports.createResolvers = (
  { cache, createResolvers, store, reporter },
  svgomgOpts
) => {
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

          return queueSVG({ absolutePath, store, reporter, cache, svgomgOpts })
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

          return queueSVG({ absolutePath, store, reporter, cache, svgomgOpts })
        }
      }
    }
  })
}
