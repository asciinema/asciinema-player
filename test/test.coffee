expect = require('chai').expect

describe "Array", ->
  describe "#indexOf()", ->
    it "should return -1 when the value is not present", ->
      expect([1, 2, 3].indexOf(5)).to.eq(-1)
      expect([1, 2, 3].indexOf(0)).to.eq(-1)
