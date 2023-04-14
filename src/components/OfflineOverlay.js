export default props => {
  const style = () => {
    return { "font-family": props.fontFamily };
  };

  return (
    <div class="ap-overlay ap-overlay-offline bg-default"><span class="fg-default" style={style()}>Stream offline</span></div>
  );
}
