/** @jsx React.DOM */

(function(exports) {
  var dom = React.DOM;

  var logoSvg = '<defs> <mask id="small-triangle-mask"> <rect width="100%" height="100%" fill="white"/> <polygon points="508.01270189221935 433.01270189221935, 208.0127018922194 259.8076211353316, 208.01270189221927 606.217782649107" fill="black"></polygon> </mask> </defs> <polygon points="808.0127018922194 433.01270189221935, 58.01270189221947 -1.1368683772161603e-13, 58.01270189221913 866.0254037844386" mask="url(#small-triangle-mask)" fill="white"></polygon> <polyline points="481.2177826491071 333.0127018922194, 134.80762113533166 533.0127018922194" stroke="white" stroke-width="90"></polyline>';

  exports.LogoPlayIcon = React.createClass({ displayName: 'LogoPlayIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 866.0254037844387 866.0254037844387", className: "icon", dangerouslySetInnerHTML: { __html: logoSvg } })
      )
    },

  });

  exports.PlayIcon = React.createClass({ displayName: 'PlayIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M1,0 L11,6 L1,12 Z" })
        )
      )
    },

  });

  exports.PauseIcon = React.createClass({ displayName: 'PauseIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M1,0 L4,0 L4,12 L1,12 Z" }),
          dom.path({ d: "M8,0 L11,0 L11,12 L8,12 Z" })
        )
      )
    },

  });

  exports.ExpandIcon = React.createClass({ displayName: 'ExpandIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M0,0 L5,0 L3,2 L5,4 L4,5 L2,3 L0,5 Z" }),
          dom.path({ d: "M12,12 L12,7 L10,9 L8,7 L7,8 L9,10 L7,12 Z" })
        )
      )
    },

  });

  exports.ShrinkIcon = React.createClass({ displayName: 'ShrinkIcon',

    render: function() {
      return (
        dom.svg({ version: "1.1", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 12 12", className: "icon" },
          dom.path({ d: "M5,5 L5,0 L3,2 L1,0 L0,1 L2,3 L0,5 Z" }),
          dom.path({ d: "M7,7 L12,7 L10,9 L12,11 L11,12 L9,10 L7,12 Z" })
        )
      )
    },

  });

})(window.asciinema = window.asciinema || {});
