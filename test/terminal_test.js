describe("Terminal", function() {

  describe("#render()", function() {

    function render(props) {
      return ReactTestUtils.renderIntoDocument(asciinema.Terminal(props));
    };

    it("should render terminal element with cursor in a proper line", function() {
      var cursor, lines, terminal, $terminal;

      cursor = { x: 2, y: 1, visible: true };

      lines = [
        [["foo", {}], ["bar", {}]],
        [["baz", {}], ["qux", {}]],
        [["quux", {}], ["quuux", {}]]
      ];

      terminal = render({ width: 9, height: 3, lines: lines, cursor: cursor });
      $terminal = $(terminal.getDOMNode());

      expect($terminal[0].className).to.eq('terminal');
      expect($terminal.find('.line:eq(0) .cursor').length).to.eq(0);
      expect($terminal.find('.line:eq(1) .cursor').length).to.eq(1);
      expect($terminal.find('.line:eq(2) .cursor').length).to.eq(0);
    });

    it("should render terminal element without cursor when cursor hidden", function() {
      var cursor, lines, terminal, $terminal;

      cursor = { x: 2, y: 1, visible: false };

      lines = [
        [["foo", {}], ["bar", {}]],
        [["baz", {}], ["qux", {}]],
        [["quux", {}], ["quuux", {}]]
      ];

      terminal = render({ width: 9, height: 3, lines: lines, cursor: cursor });
      $terminal = $(terminal.getDOMNode());

      expect($terminal[0].className).to.eq('terminal');
      expect($terminal.find('.line:eq(0) .cursor').length).to.eq(0);
      expect($terminal.find('.line:eq(1) .cursor').length).to.eq(0);
      expect($terminal.find('.line:eq(2) .cursor').length).to.eq(0);
    });

  });

});
