module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    coffee: {
      compile: {
        files: {
          'dist/js/<%= pkg.name %>.js': ['src/**/*.coffee']
        }
      }
    },

    sass: {
      dist: {
        files: {
          'dist/css/<%= pkg.name %>.css': 'src/styles/main.sass'
        }
      }
    },

    cssmin: {
      minify: {
        expand: true,
        cwd: 'dist/css/',
        src: ['**/*.css', '!*.min.css'],
        dest: 'dist/css/',
        ext: '.min.css'
      }
    },

    watch: {
      coffee: {
        files: 'src/**/*.coffee',
        tasks: ['coffee']
      },

      styles: {
        files: ['src/styles/**/*.sass', 'src/styles/**/*.scss'],
        tasks: ['sass']
      },

      rgbcolors: {
        files: ['src/colors/rgb.json'],
        tasks: ['rgb-colors']
      },

      themes: {
        files: ['src/colors/themes/*.json'],
        tasks: ['themes']
      },

      cssmin: {
        files: ['dist/css/**/*.css', '!dist/css/**/*.min.css'],
        tasks: ['cssmin']
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-coffee');
  grunt.loadNpmTasks('grunt-contrib-sass');
  grunt.loadNpmTasks('grunt-contrib-cssmin');

  grunt.registerTask('default', ['watch']);

  function generatePalette(colors, baseIndex) {
    var css = '';

    colors.forEach(function(color, index) {
      css += ".fg" + (baseIndex + index) + " { color: " + color + " }\n";
      css += ".bg" + (baseIndex + index) + " { background-color: " + color + " }\n";
    });

    return css;
  }

  grunt.registerTask('rgb-colors', '...', function() {
    var colors = grunt.file.readJSON('src/colors/rgb.json');
    var contents = generatePalette(colors, 16);
    grunt.file.write('src/styles/partials/_rgb.scss', contents);
  });

  path = require('path');

  grunt.registerTask('themes', '...', function() {
    var paths = grunt.file.expand('src/colors/themes/*.json');

    paths.forEach(function(jsonPath) {
      var name = path.basename(jsonPath, '.json');
      var theme = grunt.file.readJSON(jsonPath);
      var contents = '';

      contents += "pre.terminal {";
      contents += "color: " + theme.foreground + ";";
      contents += "background-color: " + theme.background + ";";
      contents += "}\n"

      contents += generatePalette(theme.palette, 0);

      var outputPath = 'dist/css/themes/' + name + '.css';
      grunt.file.write(outputPath, contents);
    });
  });
}
