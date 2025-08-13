module.exports = function(eleventyConfig) {

  /* image file formats */
  eleventyConfig.addPassthroughCopy("assets/img/*.png");
  eleventyConfig.addPassthroughCopy("assets/img/*.jpg");
  eleventyConfig.addPassthroughCopy("assets/img/*.jpeg");
  eleventyConfig.addPassthroughCopy("assets/img/*.svg");
  eleventyConfig.addPassthroughCopy("assets/img/*.gif");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("assets/img/badges/*.svg");
  
  /* other asset types */
  eleventyConfig.addPassthroughCopy("assets/css/*.css");
  eleventyConfig.addPassthroughCopy("assets/vid/*.webm");

  return {};
};
