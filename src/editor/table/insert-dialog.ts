export function openTableInsertDialog(onConfirm: (rows: number, cols: number) => void): void {
  document.querySelector(".ty-modal-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.className = "ty-modal-overlay";
  overlay.id = "table-insert-dialog-overlay";

  overlay.innerHTML = `
    <div class="ty-modal-card ty-table-dialog-card">
      <div class="ty-modal-header">
        <span class="ty-modal-icon">📊</span>
        <h3>插入表格</h3>
      </div>
      <p class="ty-modal-desc">
        请输入需要创建的表格列数与行数（范围 1–50）：
      </p>
      <div class="ty-table-dialog-inputs">
        <div class="ty-table-dialog-field">
          <label for="table-input-cols">列数 (Columns):</label>
          <input type="number" id="table-input-cols" min="1" max="50" value="3" />
        </div>
        <div class="ty-table-dialog-field">
          <label for="table-input-rows">行数 (Rows, 含表头):</label>
          <input type="number" id="table-input-rows" min="1" max="50" value="4" />
        </div>
      </div>
      <div class="ty-modal-footer">
        <button class="ty-btn" id="btn-cancel-insert-table">取消</button>
        <button class="ty-btn ty-btn-primary" id="btn-confirm-insert-table">确认</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const colsInput = overlay.querySelector<HTMLInputElement>("#table-input-cols")!;
  const rowsInput = overlay.querySelector<HTMLInputElement>("#table-input-rows")!;
  const btnCancel = overlay.querySelector<HTMLButtonElement>("#btn-cancel-insert-table")!;
  const btnConfirm = overlay.querySelector<HTMLButtonElement>("#btn-confirm-insert-table")!;

  const parseDimension = (val: string, fallback: number): number => {
    const trimmed = (val || '').trim();
    if (!trimmed) return fallback;
    const parsed = parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(1, Math.min(50, parsed));
  };

  const getValues = () => {
    const cols = parseDimension(colsInput.value, 3);
    const rows = parseDimension(rowsInput.value, 4);
    return { rows, cols };
  };

  const close = () => {
    window.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };

  const confirm = () => {
    const { rows, cols } = getValues();
    close();
    onConfirm(rows, cols);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  window.addEventListener("keydown", onKeyDown);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  btnCancel.addEventListener("click", close);
  btnConfirm.addEventListener("click", confirm);

  setTimeout(() => {
    colsInput.focus();
    colsInput.select();
  }, 0);
}
