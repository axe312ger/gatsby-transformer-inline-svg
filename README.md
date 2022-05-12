# gatsby-transformer-inline-svg

[![npm](https://img.shields.io/npm/v/gatsby-transformer-inline-svg.svg?label=npm@latest)](https://www.npmjs.com/package/gatsby-transformer-inline-svg)
[![npm](https://img.shields.io/npm/dm/gatsby-transformer-inline-svg.svg)](https://www.npmjs.com/package/gatsby-transformer-inline-svg)

[![Maintainability](https://api.codeclimate.com/v1/badges/fc81fa5e535561c0a6ff/maintainability)](https://codeclimate.com/github/axe312ger/gatsby-transformer-inline-svg/maintainability)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

Read and optimize (Contentful) SVG file nodes to render them inline in your website.

If you want to render static SVG files, use https://www.gatsbyjs.org/packages/gatsby-plugin-react-svg/.

## Features

* Read content of your SVG files from `gatsby-source-contentful`, `gatsby-source-datcms` and `gatsby-source-filesystem`.
* Provides original SVG content for further processing
* Optimizes output via [SVGO](https://github.com/svg/svgo)
* Provides a compact data URI via [mini-svg-data-uri](https://github.com/tigt/mini-svg-data-uri)
* Downloads svg and caches it via [createRemoteFileNode](https://github.com/gatsbyjs/gatsby/tree/master/packages/gatsby-source-filesystem#createremotefilenode)

## Installation

```sh
npm i gatsby-transformer-inline-svg
```

## Usage

Pass your server connection credentials, the remote cache directory and the directories you want to cache to the plugin options in your `gatsby-config.js`:

**gatsby-config.js**:

```js
module.exports = {
  plugins: [
    `gatsby-transformer-inline-svg`
  ]
}
```


**GraphQL Query**:
```graphql
... on ContentfulAsset {
  svg {
    content # SVG content optimized with SVGO
    originalContent # Original SVG content
    dataURI # Optimized SVG as compact dataURI
    absolutePath #
    relativePath #
  }
  file {
    contentType
    url
    fileName
  }
}
... on DatoCmsAsset {
  svg {
    content # SVG content optimized with SVGO
    originalContent # Original SVG content
    dataURI # Optimized SVG as compact dataURI
    absolutePath #
    relativePath #
  }
  url
}
... on File {
  svg {
    content # SVG content optimized with SVGO
    originalContent # Original SVG content
    dataURI # Optimized SVG as compact dataURI
    absolutePath #
    relativePath #
  }
  absolutePath
  name
  internal {
    mediaType
  }
}
```



**Rendering**:
```jsx
import React from 'react'
import propTypes from 'prop-types'
import GatsbyImage from 'gatsby-plugin-image'

// Render inline SVG with fallback non-svg images
export default function Image({ svg, gatsbyImageData, file, alt }) {
  if (file.contentType === 'image/svg+xml') {
    if (svg && svg.content) {
      // Inlined SVGs
      return <div dangerouslySetInnerHTML={{ __html: svg.content }} />
    }

    // SVGs that can/should not be inlined
    return <img src={file.url} alt={alt} />
  }

  // Non SVG images
  return <GatsbyImage image={gatsbyImageData} alt={alt} />
}
```
