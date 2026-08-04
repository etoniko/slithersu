export class ModalSystem {
    constructor() {
        this.modals = new Map();
        this.count = 0;
    }

    getContainer() {
        let container = document.getElementById("modals-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "modals-container";
            document.body.appendChild(container);
        }
        // Всегда на body — поверх меню (не внутри #user-interface с transform)
        if (container.parentElement !== document.body) {
            document.body.appendChild(container);
        }
        return container;
    }

    refresh() {
        const container = this.getContainer();
        container.style.display = "none";
        container.innerHTML = "";
        this.modals.forEach((modal) => {
            container.style.display = "flex";
            const title = modal.title
                ? `<div class="modal-title">${modal.title}</div>`
                : `<div class="modal-title"></div>`;
            const modalStr = `
        <div class="modal-background" data-modal-bg="${modal.id}"></div>
        <div class="modal" role="dialog" aria-modal="true" data-modal-id="${modal.id}">
            <div class="modal-header">
                ${title}
                <button type="button" id="${modal.id}-close" class="modal-close" aria-label="Закрыть">×</button>
            </div>
            <div class="modal-body">
                ${modal.content}
            </div>
        </div>`;
            container.insertAdjacentHTML("beforeend", modalStr);

            document.getElementById(`${modal.id}-close`)?.addEventListener("click", () => {
                this.removeModal(modal.id);
            });
            container.querySelector(`[data-modal-bg="${modal.id}"]`)?.addEventListener("click", () => {
                this.removeModal(modal.id);
            });
        });
    }

    /**
     * @param {number|null} width unused (layout via CSS)
     * @param {number|null} height unused
     * @param {string} content
     * @param {{ title?: string }} [opts]
     */
    addModal(width, height, content, opts = {}) {
        this.modals.set(++this.count, {
            id: this.count,
            width,
            height,
            content,
            title: opts.title || ""
        });
        this.refresh();
        return this.count;
    }

    removeModal(id) {
        this.modals.delete(id);
        this.refresh();
    }
}
