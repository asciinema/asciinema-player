export default props => {
  const keystrokesWrapperStyle = () => {
   return {
    position: "absolute",
    top: "3em",
    height: "20px",
    "font-size": "18px",
    "text-align": "center",
    padding: "0.5em",
    opacity: "0.8",
    "background-color": "red",
    width: "30%",
    color: "white"
   }
  };

  return (
    <div id="keystrokes" style={keystrokesWrapperStyle()} ref={props.ref}>
      { props.keystroke }
    </div>
  );
}
