// Handlers para fechar um modal só quando o clique COMEÇA E TERMINA no overlay
// (evita fechar quando o usuário seleciona texto dentro e solta o mouse fora).
// Uso: <div style={overlay} {...backdropHandlers(ref, onClose)}>
//   onde `ref` é um useRef(false) declarado no topo do componente.
export function backdropHandlers(ref, onClose) {
  return {
    onMouseDown: e => { ref.current = e.target === e.currentTarget; },
    onClick: e => {
      if (e.target === e.currentTarget && ref.current) onClose();
      ref.current = false;
    },
  };
}
