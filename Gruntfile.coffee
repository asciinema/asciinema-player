module.exports = (grunt) ->

  grunt.initConfig
    pkg: grunt.file.readJSON("package.json")

    sass:
      dist:
        files:
          "dist/css/<%= pkg.name %>.css": "src/styles/main.sass"

    cssmin:
      minify:
        expand: true
        cwd: "dist/css/"
        src: [
          "**/*.css"
          "!*.min.css"
        ]
        dest: "dist/css/"
        ext: ".min.css"

    concat:
      js:
        src: ["src/scripts/*.js"],
        dest: "dist/js/<%= pkg.name %>.js"

    uglify:
      js:
        files:
          "dist/js/<%= pkg.name %>.min.js": ["dist/js/<%= pkg.name %>.js"]

    mocha:
      test:
        src: ["test/*.html"]
        options:
          run: true
          logErrors: true

    watch:
      sass:
        files: [
          "src/styles/**/*.sass"
          "src/styles/**/*.scss"
        ]
        tasks: ["sass"]

      cssmin:
        files: [
          "dist/css/**/*.css"
          "!dist/css/**/*.min.css"
        ]
        tasks: ["cssmin"]

      test:
        files: ["test/**/*_test.js", "test/*.html"]
        tasks: ["mocha"]

      rgbcolors:
        files: ["src/colors/rgb.json"]
        tasks: ["rgb-colors"]

      themes:
        files: ["src/colors/themes/*.json"]
        tasks: ["themes"]

  grunt.loadNpmTasks "grunt-contrib-watch"
  grunt.loadNpmTasks "grunt-contrib-sass"
  grunt.loadNpmTasks "grunt-contrib-cssmin"
  grunt.loadNpmTasks "grunt-mocha"
  grunt.loadNpmTasks "grunt-contrib-concat"
  grunt.loadNpmTasks "grunt-contrib-uglify"

  grunt.registerTask "build-styles", ["rgb-colors", "themes", "sass", "cssmin"]
  grunt.registerTask "build-scripts", ["concat:js", "uglify:js"]
  grunt.registerTask "build", ["build-styles", "build-scripts"]
  grunt.registerTask "default", ["build"]

  generatePalette = (colors, baseIndex, parentSelector, brightIsBold) ->
    css = ""

    colors.forEach (color, index) ->
      index += baseIndex

      extraFgStyles = ""
      if brightIsBold and index > 7 and index < 16
        extraFgStyles = "; font-weight: bold"

      css += parentSelector + " .fg-" + index + " { color: " + color + extraFgStyles + " }\n"
      css += parentSelector + " .bg-" + index + " { background-color: " + color + " }\n"

    css

  grunt.registerTask "rgb-colors", "...", ->
    colors = grunt.file.readJSON("src/colors/rgb.json")
    contents = generatePalette(colors, 16, ".asciinema-player")
    grunt.file.write "src/styles/partials/_rgb.scss", contents

  path = require("path")

  grunt.registerTask "themes", "...", ->
    paths = grunt.file.expand("src/colors/themes/*.json")

    paths.forEach (jsonPath) ->
      name = path.basename(jsonPath, ".json")
      theme = grunt.file.readJSON(jsonPath)
      contents = ""
      contents += ".asciinema-theme-" + name + " .asciinema-terminal {"
      contents += "color: " + theme.foreground + ";"
      contents += "background-color: " + theme.background
      contents += "}\n"
      contents += ".asciinema-theme-" + name + " .fg-bg {"
      contents += "color: " + theme.background
      contents += "}\n"
      contents += ".asciinema-theme-" + name + " .bg-fg {"
      contents += "background-color: " + theme.foreground
      contents += "}\n"
      contents += generatePalette(theme.palette, 0, ".asciinema-theme-" + name, theme.bright_is_bold)
      outputPath = "dist/css/themes/" + name + ".css"
      grunt.file.write outputPath, contents
