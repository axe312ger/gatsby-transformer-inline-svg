const nock = require('nock')
const fs = require('fs-extra')

const { createResolvers } = require('./gatsby-node')

const registeredResolvers = new Map()
const actualCacheMap = new Map()
const cacheDir = __dirname + '/.cache'
fs.ensureDirSync(cacheDir)
const cache = {
  get: jest.fn((key) => actualCacheMap.get(key)),
  set: jest.fn((key, value) => actualCacheMap.set(key, value)),
  directory: cacheDir,
  actualMap: actualCacheMap
}
const createResolversMock = jest.fn((resolvers) => {
  Object.keys(resolvers).forEach((resolverName) => {
    registeredResolvers.set(resolverName, resolvers[resolverName])
  })
})
const store = {
  getState: jest.fn(() => {
    return { program: { directory: process.cwd() }, status: {} }
  })
}
const reporter = { info: jest.fn(), panic: jest.fn() }

const fixturePath = __dirname + '/fixtures/gatsby-monogram.svg'
const pixelatedFixturePath =
  __dirname + '/fixtures/gatsby-logo-with-pixel-data.svg'

const fileFixture = {
  absolutePath: fixturePath,
  internal: {
    mediaType: 'image/svg+xml'
  }
}
const contentfulAssetFixture = {
  file: {
    url: '//localhost/mocked.svg',
    contentType: 'image/svg+xml'
  },
  updatedAt: '123'
}

describe('general', () => {
  beforeEach(() => {
    createResolversMock.mockClear()
    registeredResolvers.clear()
    reporter.panic.mockClear()
  })

  test('create resolver', async () => {
    createResolvers({
      cache,
      createResolvers: createResolversMock,
      store,
      reporter
    })
    expect(registeredResolvers.size).toBe(2)
    expect(registeredResolvers.has('ContentfulAsset')).toBe(true)

    const resolverData = registeredResolvers.get('ContentfulAsset')
    expect(resolverData.svg).toBeTruthy()
    expect(resolverData.svg.type).toBe('InlineSvg')
  })

  test('removes pixelated data', async () => {
    createResolvers({
      cache,
      createResolvers: createResolversMock,
      store,
      reporter
    })

    const resolverData = registeredResolvers.get('File')
    const pixelatedFixture = JSON.parse(JSON.stringify(fileFixture))
    pixelatedFixture.absolutePath = pixelatedFixturePath

    const result = await resolverData.svg.resolve(pixelatedFixture)

    expect(reporter.panic).not.toBeCalled()
    expect(result.content).not.toContain('data:image/png')
  })
})

describe('gatsby-source-filesystem', () => {
  beforeEach(() => {
    createResolversMock.mockClear()
    registeredResolvers.clear()
    reporter.panic.mockClear()
    nock.cleanAll()
    cache.actualMap.clear()
  })
  test('process File node', async () => {
    createResolvers({
      cache,
      createResolvers: createResolversMock,
      store,
      reporter
    })

    const resolverData = registeredResolvers.get('File')
    const result = await resolverData.svg.resolve(fileFixture)

    expect(reporter.panic).not.toBeCalled()

    expect(result.absolutePath).toContain('svg')
    expect(result.absolutePath).toContain(__dirname)
    expect(result.content).toBe(
      `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 28 28\"><circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"#639\"/><path fill=\"#fff\" d=\"M6.2 21.8C4.1 19.7 3 16.9 3 14.2L13.9 25c-2.8-.1-5.6-1.1-7.7-3.2zm10.2 2.9L3.3 11.6C4.4 6.7 8.8 3 14 3c3.7 0 6.9 1.8 8.9 4.5l-1.5 1.3A9.23 9.23 0 0 0 14 5a9.1 9.1 0 0 0-8.5 6L17 22.5c2.9-1 5.1-3.5 5.8-6.5H18v-2h7c0 5.2-3.7 9.6-8.6 10.7z\"/></svg>`
    )
    expect(result.dataURI).toBe(
      `data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3e%3ccircle cx='14' cy='14' r='14' fill='%23639'/%3e%3cpath fill='white' d='M6.2 21.8C4.1 19.7 3 16.9 3 14.2L13.9 25c-2.8-.1-5.6-1.1-7.7-3.2zm10.2 2.9L3.3 11.6C4.4 6.7 8.8 3 14 3c3.7 0 6.9 1.8 8.9 4.5l-1.5 1.3A9.23 9.23 0 0 0 14 5a9.1 9.1 0 0 0-8.5 6L17 22.5c2.9-1 5.1-3.5 5.8-6.5H18v-2h7c0 5.2-3.7 9.6-8.6 10.7z'/%3e%3c/svg%3e`
    )
    expect(result.originalContent).toBe(
      fs.readFileSync(__dirname + '/fixtures/gatsby-monogram.svg').toString()
    )
    expect(result.relativePath).toBe('fixtures/gatsby-monogram.svg')
  })
  test('skip non-svg File nodes', async () => {
    createResolvers({
      cache,
      createResolvers: createResolversMock,
      store,
      reporter
    })
    const resolverData = registeredResolvers.get('File')

    const noSvgFixture = JSON.parse(JSON.stringify(fileFixture))
    noSvgFixture.internal.mediaType = 'no/svg'
    const result = await resolverData.svg.resolve(noSvgFixture)

    expect(result).toBe(null)
    expect(reporter.panic).not.toHaveBeenCalled()
  })
})

describe('gatsby-source-contentful', () => {
  beforeEach(() => {
    createResolversMock.mockClear()
    registeredResolvers.clear()
    reporter.panic.mockClear()
    nock.cleanAll()
    cache.actualMap.clear()
  })
  test('process Contentful Asset', async () => {
    createResolvers({
      cache,
      createResolvers: createResolversMock,
      store,
      reporter
    })

    const scope = nock('https://localhost')
      .get(`/mocked.svg`)
      .replyWithFile(200, fixturePath, {
        'Content-Type': 'image/svg+xml'
      })

    const resolverData = registeredResolvers.get('ContentfulAsset')
    const result = await resolverData.svg.resolve(contentfulAssetFixture)

    expect(reporter.panic).not.toBeCalled()
    expect(scope.isDone()).toBeTruthy()

    expect(result.absolutePath).toContain('svg')
    expect(result.absolutePath).toContain(__dirname)
    expect(result.content).toBe(
      `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 28 28\"><circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"#639\"/><path fill=\"#fff\" d=\"M6.2 21.8C4.1 19.7 3 16.9 3 14.2L13.9 25c-2.8-.1-5.6-1.1-7.7-3.2zm10.2 2.9L3.3 11.6C4.4 6.7 8.8 3 14 3c3.7 0 6.9 1.8 8.9 4.5l-1.5 1.3A9.23 9.23 0 0 0 14 5a9.1 9.1 0 0 0-8.5 6L17 22.5c2.9-1 5.1-3.5 5.8-6.5H18v-2h7c0 5.2-3.7 9.6-8.6 10.7z\"/></svg>`
    )
    expect(result.dataURI).toBe(
      `data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3e%3ccircle cx='14' cy='14' r='14' fill='%23639'/%3e%3cpath fill='white' d='M6.2 21.8C4.1 19.7 3 16.9 3 14.2L13.9 25c-2.8-.1-5.6-1.1-7.7-3.2zm10.2 2.9L3.3 11.6C4.4 6.7 8.8 3 14 3c3.7 0 6.9 1.8 8.9 4.5l-1.5 1.3A9.23 9.23 0 0 0 14 5a9.1 9.1 0 0 0-8.5 6L17 22.5c2.9-1 5.1-3.5 5.8-6.5H18v-2h7c0 5.2-3.7 9.6-8.6 10.7z'/%3e%3c/svg%3e`
    )
    expect(result.originalContent).toBe(
      fs.readFileSync(__dirname + '/fixtures/gatsby-monogram.svg').toString()
    )
    expect(result.relativePath).toContain('mocked.svg')
  })
  test('skip non-svg Contentful assets', async () => {
    createResolvers({
      cache,
      createResolvers: createResolversMock,
      store,
      reporter
    })
    const resolverData = registeredResolvers.get('ContentfulAsset')

    const noSvgFixture = JSON.parse(JSON.stringify(contentfulAssetFixture))
    noSvgFixture.file.contentType = 'no/svg'
    const result = await resolverData.svg.resolve(noSvgFixture)

    expect(result).toBe(null)
    expect(reporter.panic).not.toHaveBeenCalled()
  })

  test('skip empty Contentful assets', async () => {
    createResolvers({
      cache,
      createResolvers: createResolversMock,
      store,
      reporter
    })
    const resolverData = registeredResolvers.get('ContentfulAsset')

    const noFileFixture = JSON.parse(JSON.stringify(contentfulAssetFixture))
    delete noFileFixture.file.url
    const result = await resolverData.svg.resolve(noFileFixture)

    expect(result).toBe(null)
    expect(reporter.panic).not.toHaveBeenCalled()
  })
})
