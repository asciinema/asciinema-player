describe("Line", function() {

  describe("#render()", function() {

    function render(props) {
      return ReactTestUtils.renderIntoDocument(asciinema.Line(props));
    };

    it("should render parts when cursorX not given", function() {
      var line = render({
        parts: [ [ "foo", { fg: 1 } ], ["bar", {}] ],
        cursorX: null
      });

      expect(line.getDOMNode().children[0].innerHTML).to.eq('foo');
      expect(line.getDOMNode().children[0].className).to.eq('fg-1');
      expect(line.getDOMNode().children[1].innerHTML).to.eq('bar');
      expect(line.getDOMNode().children[1].className).to.eq('');
    });

    it("should render parts with cursor marked when cursorX given", function() {
      var line = render({
        parts: [ [ "foo", { fg: 1 } ], ["bar", {}] ],
        cursorX: 4
      });

      var part0 = line.getDOMNode().children[0];
      expect(part0.innerHTML).to.eq('foo');
      expect(part0.className).to.eq('fg-1');

      var part1 = line.getDOMNode().children[1];
      expect(part1.className).to.not.include('cursor');
      expect(part1.children[0].innerHTML).to.eq('b');
      expect(part1.children[1].innerHTML).to.eq('a');
      expect(part1.children[1].className).to.include('cursor');
      expect(part1.children[2].innerHTML).to.eq('r');
    });

  });

});
