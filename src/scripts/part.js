(function(exports) {
  var dom = React.DOM;

  exports.Part = React.createClass({ displayName: 'Part',
    // props: text, attrs, cursorX, cursorInverted

    render: function() {
      return dom.span({ className: this.className() }, this.children());
    },

    children: function() {
      var text = this.props.text;
      var cursorX = this.props.cursorX;

      if (cursorX !== undefined) {
        var elements = [];

        if (cursorX > 0) {
          elements = elements.concat([text.slice(0, cursorX)])
        }

        var cursor = asciinema.Cursor({
          fg:      this.fgColor() || 'fg',
          bg:      this.bgColor() || 'bg',
          char:    text[cursorX],
          inverse: this.props.cursorInverted,
        });

        elements = elements.concat([cursor]);

        if (cursorX + 1 < text.length) {
          elements = elements.concat([text.slice(cursorX + 1)]);
        }

        return elements;
      } else {
        return this.props.text;
      }
    },

    fgColor: function() {
      var fg = this.props.attrs.fg;

      if (this.props.attrs.bold && fg !== undefined && fg < 8) {
        fg += 8;
      }

      return fg;
    },

    bgColor: function() {
      var bg = this.props.attrs.bg;

      if (this.props.attrs.blink && bg !== undefined && bg < 8) {
        bg += 8;
      }

      return bg;
    },

    className: function() {
      var classes = [];
      var attrs = this.props.attrs;

      var fg = this.fgColor();
      var bg = this.bgColor();

      if (attrs.inverse) {
        var fgClass, bgClass;

        if (bg !== undefined) {
          fgClass = 'fg-' + bg;
        } else {
          fgClass = 'fg-bg';
        }

        if (fg !== undefined) {
          bgClass = 'bg-' + fg;
        } else {
          bgClass = 'bg-fg';
        }

        classes = classes.concat([fgClass, bgClass]);
      } else {
        if (fg !== undefined) {
          classes = classes.concat(['fg-' + fg]);
        }

        if (bg !== undefined) {
          classes = classes.concat(['bg-' + bg]);
        }
      }

      if (attrs.bold) {
        classes = classes.concat(['bright']);
      }

      if (attrs.underline) {
        classes = classes.concat(['underline']);
      }

      return classes.join(' ');
    }

  });
})(window.asciinema = window.asciinema || {});
