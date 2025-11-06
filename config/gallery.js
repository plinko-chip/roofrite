// config/gallery.js
const Image = require("@11ty/eleventy-img");
const fg = require("fast-glob");
const path = require("path");

// unchanged helper: responsive <picture>
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
    alt, sizes, loading: "lazy", decoding: "async",
  });
  return { picture, href: largestJpeg.url };
}

// convert repo path to site URL (for passthrough files like .gif)
function toUrl(file) {
  return "/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addNunjucksAsyncShortcode("gallery", async function (pattern, altPrefix = "") {
    const files = await fg(pattern, { onlyFiles: true });

    const cards = await Promise.all(files.map(async (file) => {
      const alt = `${altPrefix}${path.basename(file)}`;
      const ext = path.extname(file).toLowerCase();

      if (ext === ".gif") {
        // === GIF branch ===
        // 1) Poster thumbnail (static first frame) via eleventy-img
        const poster = await imgHTML(file, alt);
        // 2) Lightbox opens the ORIGINAL GIF (ensure .gif is a passthrough)
        const href = toUrl(file);

        return `<button class="gl-card is-gif" type="button" data-full="${href}" data-alt="${alt}" aria-label="Open ${alt}">${poster.picture}</button>`;
      } else {
        // === normal images ===
        const { picture, href } = await imgHTML(file, alt);
        return `<button class="gl-card" type="button" data-full="${href}" data-alt="${alt}" aria-label="Open ${alt}">${picture}</button>`;
      }
    }));

    const cardsHtml = cards.map(c => c.trim()).join("");

    return [
      '<div class="gl-gallery"><div class="gl-grid">',
      cardsHtml,
      '</div></div>',
      // Reusable modal
      '<div class="gl-lightbox" id="gl-lightbox" aria-hidden="true">',
      '<div class="gl-backdrop" data-gl-close></div>',
      '<div class="gl-modal" role="dialog" aria-modal="true" aria-label="Image viewer">',
      '<button class="gl-close" type="button" data-gl-close aria-label="Close">&times;</button>',
      '<button class="gl-arrow gl-prev" type="button" data-gl-prev aria-label="Previous image">&#10094;</button>',
      '<img id="gl-full" alt="">',
      '<button class="gl-arrow gl-next" type="button" data-gl-next aria-label="Next image">&#10095;</button>',
      '</div>',
      '</div>',
    ].join("");
  });
};
