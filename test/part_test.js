describe("Part", function() {

  describe("#render()", function() {

    function render(props) {
      return ReactTestUtils.renderIntoDocument(asciinema.Part(props));
    };

    it("should render element with given text as its contents", function() {
      var part = render({ text: 'foo', attrs: {} });

      expect(part.getDOMNode().innerHTML).to.eq('foo');
    });

    it("should render element with empty class when attrs are empty", function() {
      var part = render({ text: 'foo', attrs: {} });

      expect(part.getDOMNode().className).to.eq('');
    });

    it("should include custom fg color in class", function() {
      var part = render({ text: 'foo', attrs: { fg: 1 } });

      expect(part.getDOMNode().className).to.eq('fg-1');
    });

    it("should include custom bg color in class", function() {
      var part = render({ text: 'foo', attrs: { bg: 2 } });

      expect(part.getDOMNode().className).to.eq('bg-2');
    });

    it("should include bright (bold) in class when given", function() {
      var part = render({ text: 'foo', attrs: { bold: true } });

      expect(part.getDOMNode().className).to.eq('bright');
    });

    it("should include underline in class when given", function() {
      var part = render({ text: 'foo', attrs: { underline: true } });

      expect(part.getDOMNode().className).to.eq('underline');
    });

    it("should make the fg color brighter when bold", function() {
      var part = render({ text: 'foo', attrs: { fg: 1, bold: true } });

      expect(part.getDOMNode().className).to.eq('fg-9 bright');
    });

    it("should not make the fg color brighter when bold and fg > 7", function() {
      var part = render({ text: 'foo', attrs: { fg: 8, bold: true } });

      expect(part.getDOMNode().className).to.eq('fg-8 bright');
    });

    it("should make the bg color brighter when blink", function() {
      var part = render({ text: 'foo', attrs: { bg: 2, blink: true } });

      expect(part.getDOMNode().className).to.eq('bg-10');
    });

    it("should not make the bg color brighter when bold and bg > 7", function() {
      var part = render({ text: 'foo', attrs: { bg: 8, blink: true } });

      expect(part.getDOMNode().className).to.eq('bg-8');
    });

    it("should include inversed fg and bg colors in class when inversed", function() {
      var part = render({ text: 'foo', attrs: { inverse: true } });

      expect(part.getDOMNode().className).to.eq('fg-bg bg-fg');
    });

    it("should use given fg color as bg when inversed", function() {
      var part = render({ text: 'foo', attrs: { fg: 1, inverse: true } });

      expect(part.getDOMNode().className).to.eq('fg-bg bg-1');
    });

    it("should use brighter version of given fg as bg when inversed and bold", function() {
      var part = render({ text: 'foo', attrs: { fg: 1, bold: true, inverse: true } });

      expect(part.getDOMNode().className).to.eq('fg-bg bg-9 bright');
    });

    it("should not use brighter version of given fg as bg when inversed and bold and fg > 7", function() {
      var part = render({ text: 'foo', attrs: { fg: 8, bold: true, inverse: true } });

      expect(part.getDOMNode().className).to.eq('fg-bg bg-8 bright');
    });

    it("should use given bg color as fg when inversed", function() {
      var part = render({ text: 'foo', attrs: { bg: 2, inverse: true } });

      expect(part.getDOMNode().className).to.eq('fg-2 bg-fg');
    });

    it("should user brighter version of given bg as fg when inversed and blink", function() {
      var part = render({ text: 'foo', attrs: { bg: 2, blink: true, inverse: true } });

      expect(part.getDOMNode().className).to.eq('fg-10 bg-fg');
    });

    it("should not use brighter version of given bg as fg when inversed and blinkg and bg > 7", function() {
      var part = render({ text: 'foo', attrs: { bg: 8, blink: true, inverse: true } });

      expect(part.getDOMNode().className).to.eq('fg-8 bg-fg');
    });

    it("should wrap the cursor in additional span element when cursor at the start of line", function() {
      var part = render({ text: 'foo', attrs: { fg: 1, bg: 2 }, cursorX: 0 });

      expect(part.getDOMNode().className).to.eq('fg-1 bg-2');
      expect(part.getDOMNode().children.length).to.eq(2);
      expect(part.getDOMNode().children[0].innerHTML).to.eq('f');
      expect(part.getDOMNode().children[0].className).to.include('cursor');
      expect(part.getDOMNode().children[1].innerHTML).to.eq('oo');
    });

    it("should wrap the cursor in additional span element when cursor in the middle of line", function() {
      var part = render({ text: 'foo', attrs: { fg: 1, bg: 2 }, cursorX: 1 });

      expect(part.getDOMNode().className).to.eq('fg-1 bg-2');
      expect(part.getDOMNode().children.length).to.eq(3);
      expect(part.getDOMNode().children[0].innerHTML).to.eq('f');
      expect(part.getDOMNode().children[1].innerHTML).to.eq('o');
      expect(part.getDOMNode().children[1].className).to.include('cursor');
      expect(part.getDOMNode().children[2].innerHTML).to.eq('o');
    });

    it("should wrap the cursor in additional span element when cursor at the end of line", function() {
      var part = render({ text: 'foo', attrs: { fg: 1, bg: 2 }, cursorX: 2 });

      expect(part.getDOMNode().className).to.eq('fg-1 bg-2');
      expect(part.getDOMNode().children.length).to.eq(2);
      expect(part.getDOMNode().children[0].innerHTML).to.eq('fo');
      expect(part.getDOMNode().children[1].innerHTML).to.eq('o');
      expect(part.getDOMNode().children[1].className).to.include('cursor');
    });

  });

});
