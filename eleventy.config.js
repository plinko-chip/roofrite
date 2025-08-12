module.exports = function(eleventyConfig) {

  /* image file formats */
  eleventyConfig.addPassthroughCopy("assets/img/*.png");
  eleventyConfig.addPassthroughCopy("assets/img/*.jpg");
  eleventyConfig.addPassthroughCopy("assets/img/*.jpeg");
  eleventyConfig.addPassthroughCopy("assets/img/*.svg");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("assets/img/badges/*.svg");

  /* other asset types */
  eleventyConfig.addPassthroughCopy("assets/css/*.css");
  eleventyConfig.addPassthroughCopy("assets/vid/*.webm");

  /* why? */
  eleventyConfig.addPassthroughCopy("404.html");

  return {};
};
