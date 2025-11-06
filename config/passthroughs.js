module.exports = function(eleventyConfig) {

    /* image file formats */
  eleventyConfig.addPassthroughCopy("assets/img/*.png");
  eleventyConfig.addPassthroughCopy("assets/img/*.jpg");
  eleventyConfig.addPassthroughCopy("assets/img/*.jpeg");
  eleventyConfig.addPassthroughCopy("assets/img/*.svg");
  eleventyConfig.addPassthroughCopy("assets/img/*.gif");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("assets/img/badges/*.svg");
  eleventyConfig.addPassthroughCopy("assets/img/badges/*.png");
  
  /* other asset types */
  eleventyConfig.addPassthroughCopy("assets/css/*.css");
  eleventyConfig.addPassthroughCopy("assets/vid/*.webm");
  eleventyConfig.addPassthroughCopy({ "assets": "assets" });
  eleventyConfig.addPassthroughCopy("assets/js/*.js");
  
  /* tired of gitbash spazzing out when I'm making js edits*/
  eleventyConfig.addWatchTarget("assets/js/");

};