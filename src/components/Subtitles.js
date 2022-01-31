
export default props => {
  const subtitleStyle = () => {
    return {
      margin: "0 auto",
      padding: "0.5em",
      opacity: "0.8",
      "background-color": "black",
      "font-size": "16px"
    }
  }

  return (
      <div style={subtitleStyle()} ref={props.ref}>
      <For each={props.subtitle}>
        {(letter, i) => <span style={letterStyle()}>{letter}</span>}
      </For>
      </div>
  );
}
