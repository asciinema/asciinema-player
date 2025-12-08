export default (props) => {
  return (
    <div class="ap-overlay ap-overlay-info" classList={{ "ap-was-playing": props.wasPlaying }}>
      <span>{props.message}</span>
    </div>
  );
};
