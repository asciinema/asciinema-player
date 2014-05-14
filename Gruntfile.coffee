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

    react:
      files:
        expand: true
        cwd: 'src/'
        src: ['**/*.jsx']
        dest: 'src/'
        ext: '.js'

    coffee:
      options:
        bare: true

      all:
        files: [{
          expand: true
          cwd: 'src/'
          src: ['**/*.coffee']
          dest: 'src/'
          ext: '.js'
        }, {
          expand: true
          cwd: 'test/'
          src: ['**/*.coffee']
          dest: 'test/'
          ext: '.js'
        }]

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

      react:
        files: "src/**/*.jsx"
        tasks: ["react"]

      coffee:
        files: ["src/**/*.coffee", "test/**/*.coffee"]
        tasks: ["coffee"]

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
  grunt.loadNpmTasks "grunt-contrib-coffee"
  grunt.loadNpmTasks "grunt-react"
  grunt.loadNpmTasks "grunt-contrib-sass"
  grunt.loadNpmTasks "grunt-contrib-cssmin"
  grunt.loadNpmTasks "grunt-mocha"

  grunt.registerTask "default", ["watch"]

  generatePalette = (colors, baseIndex, parentSelector) ->
    css = ""
    colors.forEach (color, index) ->
      css += parentSelector + " .fg-" + (baseIndex + index) + " { color: " + color + " }\n"
      css += parentSelector + " .bg-" + (baseIndex + index) + " { background-color: " + color + " }\n"

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
      contents += ".asciinema-theme-" + name + " .terminal {"
      contents += "color: " + theme.foreground + ";"
      contents += "background-color: " + theme.background
      contents += "}\n"
      contents += ".asciinema-theme-" + name + " .fg-bg {"
      contents += "color: " + theme.background
      contents += "}\n"
      contents += ".asciinema-theme-" + name + " .bg-fg {"
      contents += "background-color: " + theme.foreground
      contents += "}\n"
      contents += generatePalette(theme.palette, 0, ".asciinema-theme-" + name)
      outputPath = "dist/css/themes/" + name + ".css"
      grunt.file.write outputPath, contents
