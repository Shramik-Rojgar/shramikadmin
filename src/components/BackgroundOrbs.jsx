function BackgroundOrbs() {
  const styles = {
    bgBlobs: {
      position: 'fixed',
      inset: 0,
      zIndex: -1,
      pointerEvents: 'none',
      overflow: 'hidden',
      background: '#FFFAEF',
    },
    blobBase: {
      position: 'absolute',
      borderRadius: '50%',
      filter: 'blur(8px)',
    },
    b1: { width: 520, height: 520, top: -180, left: -140, background: 'radial-gradient(circle, #FFCB5E66, transparent 64%)' },
    b2: { width: 560, height: 560, top: -120, right: -200, background: 'radial-gradient(circle, #FFB05444, transparent 64%)' },
    b3: { width: 520, height: 520, top: 880,  left: -180,  background: 'radial-gradient(circle, #FFD98A55, transparent 64%)' },
    b4: { width: 560, height: 560, bottom: -200, right: -160, background: 'radial-gradient(circle, #FFC15e4d, transparent 64%)' },
  };
  return (
    <div style={styles.bgBlobs}>
      <span style={{ ...styles.blobBase, ...styles.b1 }} />
      <span style={{ ...styles.blobBase, ...styles.b2 }} />
      <span style={{ ...styles.blobBase, ...styles.b3 }} />
      <span style={{ ...styles.blobBase, ...styles.b4 }} />
    </div>
  );
}

export default BackgroundOrbs;
