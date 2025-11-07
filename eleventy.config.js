const fs = require("fs");
const crypto = require("crypto");

module.exports = function(eleventyConfig) {
  // Fingerprint filter: appends ?v=<hash> to the original path
  eleventyConfig.addNunjucksFilter("fingerprint", function (path) {
    try {
      const diskPath = path.startsWith("/") ? `.${path}` : path; // make it relative to project root
      const buf = fs.readFileSync(diskPath);
      const hash = crypto.createHash("md5").update(buf).digest("hex").slice(0, 10);
      return `${path}?v=${hash}`;
    } catch (e) {
      // Fallback: timestamp (shouldn't happen in prod, but keeps dev resilient)
      return `${path}?v=${Date.now()}`;
    }
  });
  
  eleventyConfig.addPlugin(require("./config/passthroughs"));
  eleventyConfig.addPlugin(require("./config/gallery"));

  return {
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
