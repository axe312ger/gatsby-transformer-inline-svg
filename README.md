# gatsby-transformer-inline-svg

[![npm](https://img.shields.io/npm/v/gatsby-transformer-inline-svg.svg?label=npm@latest)](https://www.npmjs.com/package/gatsby-transformer-inline-svg)
[![npm](https://img.shields.io/npm/dm/gatsby-transformer-inline-svg.svg)](https://www.npmjs.com/package/gatsby-transformer-inline-svg)

[![Maintainability](https://api.codeclimate.com/v1/badges/fc81fa5e535561c0a6ff/maintainability)](https://codeclimate.com/github/axe312ger/gatsby-transformer-inline-svg/maintainability)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

Read and optimize Contentful graqhQL SVG file nodes to render them inline in your website.

If you want to render static SVG files, use https://www.gatsbyjs.org/packages/gatsby-plugin-react-svg/. This plugin is for everybody using svgs that are in Contentful.

## Features

* Read content of your SVG files from Contentful and provides it for manipulation and rendering in GraphQL
* Optimizes output via [SVGO](https://github.com/svg/svgo)
* Provides a compact data URI via [mini-svg-data-uri](https://github.com/tigt/mini-svg-data-uri)
* Downloads svg and caches it via [createRemoteFileNode](https://github.com/gatsbyjs/gatsby/tree/master/packages/gatsby-source-filesystem#createremotefilenode)


## Todo

This is still in development, missing features:

* Support `gatsby-source-filesystem` nodes
* The multi-layered cache and queue still tends to handle files twice. This needs to be simplified and fixed

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
    contentType
    details {
      image {
        width
        height
      }
    }
  }
  fluid (...) {
    ...
  }
}
```



**Rendering**:
```jsx
import React from 'react'
import propTypes from 'prop-types'
import Img from 'gatsby-image'

// Render inline SVG with fallback non-svg images
export default function Image({ svg, fluid, file, alt }) {
  if (file.contentType === 'image/svg+xml') {
    if (svg && svg.content) {
      // Inlined SVGs
      return <div dangerouslySetInnerHTML={{ __html: svg.content }} />
    }

    // SVGs that can/should not be inlined
    return <img src={file.url} alt={alt} />
  }

  // Non SVG images
  return <Img fluid={fluid} alt={alt} />
}

Image.propTypes = {
  svgContent: propTypes.string,
  fluid: propTypes.object,
  file: propTypes.object.isRequired,
  alt: propTypes.string.isRequired,
}
```
