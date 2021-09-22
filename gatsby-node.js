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

async function parseSVG({ source, uri, store, cache, reporter }) {
  // Get remote file
  const absolutePath = await fetchRemoteFile({
    url: uri,
    cache
  })

  // Read local file
  const svg = await fs.readFile(absolutePath, 'utf8')

  if (!svg) {
    throw new Error(
      'Unable to read ' + source.contentful_id + ': ' + absolutePath
    )
  }

  // Optimize
  if (svg.indexOf('base64') !== -1) {
    reporter.info(
      `SVG contains pixel data. Pixel data was removed to avoid file size bloat.\n${source.contentful_id}:  ${absolutePath}`
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

exports.createResolvers = ({ cache, createResolvers, store, reporter }) => {
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
                reporter
              })

              sessionCache[cacheId] = result
              await cache.set(cacheId, result)

              return result
            } catch (err) {
              reporter.panic(err)
              return null
            }
          })

          return result
        }
      }
    }
  })
}
