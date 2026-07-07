// 責務: 環境シェルの動作確認表示（ゲームコード禁止。C-0VのHMR検証専用）
function render(): void {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (app) {
    app.textContent = "environment OK";
  }
}

render();

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    render();
  });
}
