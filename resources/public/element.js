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

  function attribute(element, attrName, optName, defaultValue, coerceFn) {
    var obj = {};
    var value = element.getAttribute(attrName);
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
      attribute(this, 'cols', 'width', 0, parseInt),
      attribute(this, 'rows', 'height', 0, parseInt),
      attribute(this, 'autoplay', 'autoPlay', true, Boolean),
      attribute(this, 'preload', 'preload', true, Boolean),
      attribute(this, 'loop', 'loop', true, Boolean),
      attribute(this, 'start-at', 'startAt', 0, parseInt),
      attribute(this, 'speed', 'speed', 1, parseFloat),
      attribute(this, 'poster', 'poster'),
      attribute(this, 'font-size', 'fontSize'),
      attribute(this, 'theme', 'theme'),
      attribute(this, 'title', 'title'),
      attribute(this, 'author', 'author'),
      attribute(this, 'author-url', 'authorURL'),
      attribute(this, 'author-img-url', 'authorImgURL'),
      {
        onCanPlay: function() {
          self.dispatchEvent(new CustomEvent("loadedmetadata"));
          self.dispatchEvent(new CustomEvent("loadeddata"));
          self.dispatchEvent(new CustomEvent("canplay"));
          self.dispatchEvent(new CustomEvent("canplaythrough"));
        },

        onPlay: function() {
          self.dispatchEvent(new CustomEvent("play"));
        },

        onPause: function() {
          self.dispatchEvent(new CustomEvent("pause"));
        }
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

  Object.defineProperty(AsciinemaPlayerProto, "duration", {
    get: function() {
      return this.player.getDuration() || 0;
    },

    set: function(value) {}
  });

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
