(function(exports) {
  var dom = React.DOM;

  exports.LoadingOverlay = React.createClass({ displayName: 'LoadingOverlay',

    render: function() {
      return (
        dom.div({ className: "loading" },
          dom.div({ className: "loader" })
        )
      );
    }

  });

  exports.StartOverlay = React.createClass({ displayName: 'StartOverlay',
    // props: start

    render: function() {
      return (
        dom.div({ className: "start-prompt", onClick: this.onClick },
          dom.div({ className: "play-button" },
            dom.div(null,
              dom.span(null,
                asciinema.LogoPlayIcon()
              )
            )
          )
        )
      );
    },

    onClick: function(event) {
      event.preventDefault();
      this.props.start();
    },

  });
})(window.asciinema = window.asciinema || {});
