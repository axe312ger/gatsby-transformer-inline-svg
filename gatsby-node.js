const crypto = require(`crypto`)
const fs = require(`fs-extra`)

const Debug = require('debug')
const { createRemoteFileNode } = require(`gatsby-source-filesystem`)
const svgToMiniDataURI = require('mini-svg-data-uri')
const { default: PQueue } = require('p-queue')
const SVGO = require('svgo')

const debug = new Debug('gatsby-transformer-inline-svg')
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

async function parseSVG({
  source,
  uri,
  store,
  cache,
  createNode,
  createNodeId
}) {
  // Get remote file
  debug('Downloading ' + source.contentful_id + ': ' + uri)
  const { absolutePath, relativePath } = await createRemoteFileNode({
    url: uri,
    parentNodeId: source.id,
    store,
    cache,
    createNode,
    createNodeId
  })

  // Read local file
  const svg = await fs.readFile(absolutePath)

  if (!svg) {
    throw new Error(
      'Unable to read ' + source.contentful_id + ': ' + absolutePath
    )
  }

  // Optimize
  if (svg.indexOf('base64') !== -1) {
    console.log(
      'SVG contains pixel data. Pixel data was removed to avoid file size bloat.',
      source.contentful_id + ': ' + absolutePath
    )
  }
  const { data: optimizedSVG } = await svgo.optimize(svg, {
    path: absolutePath
  })

  // Create mini data URI
  const dataURI = svgToMiniDataURI(optimizedSVG)

  return {
    content: optimizedSVG,
    originalContent: svg,
    dataURI,
    absolutePath,
    relativePath
  }
}

exports.createResolvers = ({
  actions,
  cache,
  createNodeId,
  createResolvers,
  store,
  reporter
}) => {
  const { createNode } = actions
  createResolvers({
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

          debug({ source, url, contentType })

          // Ensure to process only svgs and files with an url
          if (contentType !== 'image/svg+xml' || !url) {
            return null
          }

          const cacheId =
            'contentful-svg-content-' +
            crypto
              .createHash(`md5`)
              .update(url)
              .digest(`hex`)

          const result = await queue.add(async () => {
            const uri = `http:${url}`

            try {
              if (sessionCache[cacheId]) {
                return sessionCache[cacheId]
              }

              const cachedData = await cache.get(cacheId)

              if (cachedData) {
                return cachedData
              }

              const result = await parseSVG({
                source,
                uri,
                store,
                cache,
                createNode,
                createNodeId
              })

              sessionCache[cacheId] = result
              await cache.set(cacheId, result)

              debug('Processed and cached ' + url)
              return result
            } catch (err) {
              debug.error(err)
              return null
            }
          })

          return result
        }
      }
    }
  })
}
