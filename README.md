# gatsby-transformer-inline-svg

[![npm](https://img.shields.io/npm/v/gatsby-transformer-inline-svg.svg?label=npm@latest)](https://www.npmjs.com/package/gatsby-transformer-inline-svg)
[![npm](https://img.shields.io/npm/v/gatsby-transformer-inline-svg/canary.svg)](https://www.npmjs.com/package/gatsby-transformer-inline-svg)
[![npm](https://img.shields.io/npm/dm/gatsby-transformer-inline-svg.svg)](https://www.npmjs.com/package/gatsby-transformer-inline-svg)

[![Maintainability](https://api.codeclimate.com/v1/badges/fc81fa5e535561c0a6ff/maintainability)](https://codeclimate.com/github/axe312ger/gatsby-transformer-inline-svg/maintainability)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-v1.4%20adopted-ff69b4.svg)](CODE_OF_CONDUCT.md)

Read and optimize graqhQL SVG file nodes to render them inline in your website.

If you want to render static SVG files, use https://www.gatsbyjs.org/packages/gatsby-plugin-react-svg/. This plugin is for everybody having a not-fixed set of svgs, eventually from an external data source like Contentful.


## Todo

This is still in development, missing features:

* support `gatsby-source-filesystem` nodes
* clean up code
* actually cache to disk, not to gatsby cache only

## Features

* Read content of your SVG file nodes and stores it as `svgContent` field.
* Optimizes output via [SVGO](https://github.com/svg/svgo)
* Contentful only: Download svg and cache it to `node_modules/.cache/gatsby-transformer-inline-svg`

## Installation

```sh
npm i gatsby-transformer-inline-svg@alpha
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
  svgContent
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
export default function Image({ svgContent, fluid, file, alt }) {
  if (file.contentType === 'image/svg+xml') {
    if (svgContent) {
      // Inlined SVGs
      return <div dangerouslySetInnerHTML={{ __html: svgContent }} />
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
