function registerAsciinemaPlayerElement() {
  var AsciinemaPlayerProto = Object.create(HTMLElement.prototype);

  function merge() {
    var merged = {};
    for (var i=0; i<arguments.length; i++) {
      var obj = arguments[i];
      for (var attrname in obj) {
        merged[attrname] = obj[attrname];
      }
    }
    return merged;
  }

  AsciinemaPlayerProto.opt = function(attrName, optName, defaultValue, coerceFn) {
    var obj = {};
    var value = this.getAttribute(attrName);
    if (value !== null) {
      if (value === '' && defaultValue !== undefined) {
        value = defaultValue;
      } else if (coerceFn) {
        value = coerceFn(value);
      }
      obj[optName] = value;
    }
    return obj;
  };

  AsciinemaPlayerProto.createdCallback = function() {
    var self = this;

    var opts = merge(
      this.opt('cols', 'width', 0, parseInt),
      this.opt('rows', 'height', 0, parseInt),
      this.opt('autoplay', 'autoPlay', true, Boolean),
      this.opt('preload', 'preload', true, Boolean),
      this.opt('loop', 'loop', true, Boolean),
      this.opt('start-at', 'startAt', 0, parseInt),
      this.opt('speed', 'speed', 1, parseFloat),
      this.opt('poster', 'poster'),
      this.opt('font-size', 'fontSize'),
      this.opt('theme', 'theme'),
      this.opt('title', 'title'),
      this.opt('author', 'author'),
      this.opt('author-url', 'authorURL'),
      this.opt('author-img-url', 'authorImgURL'),
      {
        onPlay: function() { self.dispatchEvent(new CustomEvent("play")); },
        onPause: function() { self.dispatchEvent(new CustomEvent("pause")); }
      }
    );

    this.player = asciinema.player.js.CreatePlayer(this, this.getAttribute('src'), opts);
  };

  AsciinemaPlayerProto.attachedCallback = function() {
    var self = this;
    setTimeout(function() {
      self.dispatchEvent(new CustomEvent("attached"));
    }, 0);
  };

  AsciinemaPlayerProto.detachedCallback = function() {
    asciinema.player.js.UnmountPlayer(this);
    this.player = undefined;
  };

  Object.defineProperty(AsciinemaPlayerProto, "currentTime", {
    get: function() {
      return this.player.getCurrentTime();
    },

    set: function(value) {
      this.player.setCurrentTime(value);
    }
  });

  document.registerElement('asciinema-player', { prototype: AsciinemaPlayerProto });
};
