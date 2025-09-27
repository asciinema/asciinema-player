export default (props) => {
  const style = () => {
    return { "font-family": props.fontFamily };
  };

  return (
    <div class="ap-overlay ap-overlay-info" classList={{ "ap-was-playing": props.wasPlaying }}>
      <span style={style()}>{props.message}</span>
    </div>
  );
};
