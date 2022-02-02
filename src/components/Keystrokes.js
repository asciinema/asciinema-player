
export default props => {
  const keystrokesWrapperStyle = () => {
   return {
    position: "absolute",
    bottom: "3em",
    "font-size": "18px",
    "text-align": "center",
    padding: "0.5em",
    opacity: "0.8",
    "background-color": "black",
    width: "100%",
    color: "white"
   }
  };

  return (
    <div style={keystrokesWrapperStyle()} ref={props.ref}>
      <For each={props.keystrokes}>
        {(key, i) => <span innerHTML={"&nbsp;" + key[1]} />}
      </For>
    </div>
  );
}
