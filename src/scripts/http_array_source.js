(function(exports) {

  function HttpArraySource(url, speed) {
    this.url   = url;
    this.speed = speed || 1;
  }

  HttpArraySource.prototype.start = function(onFrame, onFinish, setLoading) {
    var controller;

    if (this.data) {
      controller = this.createController(onFrame, onFinish);
    } else {
      this.fetchData(setLoading, function() {
        controller = this.createController(onFrame, onFinish);
      }.bind(this));
    }

    return {
      time: function() {
        if (controller && controller.time) {
          return controller.time();
        } else {
          return 0;
        }
      },

      pause: function() {
        if (controller && controller.pause) {
          return controller.pause();
        }
      },

      resume: function() {
        if (controller && controller.resume) {
          return controller.resume();
        }
      },

      seek: function(time) {
        if (controller && controller.seek) {
          return controller.seek(time);
        }
      }
    }
  }

  HttpArraySource.prototype.fetchData = function(setLoading, onResult) {
    setLoading(true);

    var request = $.ajax({ url: this.url, dataType: 'json' });

    request.done(function(data) {
      setLoading(false);
      this.data = data;
      onResult();
    }.bind(this));

    request.fail(function(jqXHR, textStatus) {
      setLoading(false);
      console.error(this.url, textStatus);
    });
  }

  HttpArraySource.prototype.createController = function(onFrame, onFinish) {
    arraySource = new asciinema.NavigableArraySource(this.data, this.speed);

    return arraySource.start(onFrame, onFinish);
  }

  exports.HttpArraySource = HttpArraySource;

})(window.asciinema = window.asciinema || {});
