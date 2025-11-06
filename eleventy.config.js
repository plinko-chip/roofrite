module.exports = function(eleventyConfig) {

  eleventyConfig.addPlugin(require("./config/passthroughs"));
  eleventyConfig.addPlugin(require("./config/gallery"));

  return {
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
