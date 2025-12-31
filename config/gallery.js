// config/gallery.js
const Image = require("@11ty/eleventy-img");
const fg = require("fast-glob");
const path = require("path");
const { syncGalleryAlts, altForFile } = require("./gallery-alts");

// helper: responsive <picture>
async function imgHTML(src, alt = "", sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw") {
  const metadata = await Image(src, {
    widths: [320, 640, 960, 1280, 1600],
    formats: ["webp", "jpeg"],
    urlPath: "/assets/img/generated/",
    outputDir: "_site/assets/img/generated/",
    useCache: true,
  });
  const largestJpeg = metadata.jpeg[metadata.jpeg.length - 1];
  const picture = Image.generateHTML(metadata, {
    alt,
    sizes,
    loading: "lazy",
    decoding: "async",
  });
  return { picture, href: largestJpeg.url };
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addNunjucksAsyncShortcode("gallery", async function (pattern /* keeps your glob usage */) {
    // resolve and sort files deterministically
    const files = (await fg(pattern, { onlyFiles: true })).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    // cache manifests per folder so we only read/write each once
    const manifestCache = new Map(); // dirAbs -> manifestObj

    function getAltForAbsoluteFile(absPath) {
      const dirAbs = path.dirname(absPath);
      const fileBasename = path.basename(absPath);

      let manifest = manifestCache.get(dirAbs);
      if (!manifest) {
        // create/update _gallery-alts.json in this folder (adds missing keys, removes stale)
        manifest = syncGalleryAlts(dirAbs);
        manifestCache.set(dirAbs, manifest);
      }

      // resolve alt: non-empty => use; "" => default; missing => humanized filename
      const { alt } = altForFile(manifest, fileBasename);
      // basic escaping for quotes inside attribute
      return alt.replace(/"/g, "&quot;");
    }

    // build cards
    const cards = await Promise.all(
      files.map(async (absFile) => {
        const alt = getAltForAbsoluteFile(path.resolve(absFile));
        const { picture, href } = await imgHTML(absFile, alt);
        return `
          <button class="gl-card" type="button"
                  data-full="${href}"
                  data-alt="${alt}"
                  aria-label="Open ${alt}">
            ${picture}
          </button>
        `;
      })
    );

    const cardsHtml = cards.map((c) => c.trim()).join("");

    // lightbox scaffold (unchanged structure)
    return [
      '<div class="gl-gallery"><div class="gl-grid">',
      cardsHtml,
      '</div></div>',
      '<!-- Reusable modal -->',
      '<div class="gl-lightbox" id="gl-lightbox" aria-hidden="true">',
      '  <div class="gl-backdrop" data-gl-close></div>',
      '  <div class="gl-modal" role="dialog" aria-modal="true" aria-label="Image viewer">',
      '    <button class="gl-close" type="button" data-gl-close aria-label="Close">&times;</button>',
      '    <button class="gl-arrow gl-prev" type="button" data-gl-prev aria-label="Previous image">&#10094;</button>',
      '    <img id="gl-full" alt="">',
      '    <button class="gl-arrow gl-next" type="button" data-gl-next aria-label="Next image">&#10095;</button>',
      '  </div>',
      '</div>',
    ].join("");
  });
};
