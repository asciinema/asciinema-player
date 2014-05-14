/** @jsx React.DOM */

(function(exports) {
  var dom = React.DOM;

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
