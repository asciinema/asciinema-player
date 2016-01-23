(function() {
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

    AsciinemaPlayerProto.opt = function(optName, attrName, defaultValue, coerceFn) {
        var obj = {};
        var value = this.getAttribute(attrName);
        if (value !== undefined) {
            if (value === '' && defaultValue !== undefined) {
                value = defaultValue;
            } else if (coerceFn) {
                value = coerceFn(value);
            }
            obj[optName] = value;
        }
        return obj;
    }

    AsciinemaPlayerProto.createdCallback = function() {
        var opts = merge(
            this.opt('width', 'width', 0, parseInt),
            this.opt('height', 'height', 0, parseInt),
            this.opt('autoPlay', 'autoplay', true, Boolean),
            this.opt('loop', 'loop', true, Boolean),
            this.opt('startAt', 't', 0, parseInt),
            this.opt('speed', 'speed', 1, parseFloat),
            // this.opt('snapshot', 'snapshot', true, Boolean),
            this.opt('fontSize', 'font-size'),
            this.opt('theme', 'theme'),
            this.opt('title', 'title'),
            this.opt('author', 'author'),
            this.opt('authorURL', 'author-url'),
            this.opt('authorImgURL', 'author-img-url')
        );

        asciinema_player.core.CreatePlayer(this, this.getAttribute('src'), opts);
    };

    document.registerElement('asciinema-player', { prototype: AsciinemaPlayerProto });
})();
