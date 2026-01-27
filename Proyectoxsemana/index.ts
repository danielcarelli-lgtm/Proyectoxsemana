import { IInputs, IOutputs } from "./generated/ManifestTypes";

export class WeeklyTimesheet implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _context: ComponentFramework.Context<IInputs>;
    private _currentWeekOffset: number = 0;
    private _showActive: boolean = true;
    private _projects: any[] = [];
    private _users: any[] = [];
    private _selectedProjectId: string = "ALL";
    private _searchText: string = "";
    private _rawRecords: any[] = [];

    public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, state: ComponentFramework.Dictionary, container: HTMLDivElement): void {
        this._container = container;
        this._context = context;
        this._loadProjects();
        this._loadImputaciones();
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this._context = context;
        this.render();
    }

    private async _loadProjects(): Promise<void> {
        const stateCode = this._showActive ? "0" : "1";
        const fetchXml = `<fetch version="1.0" mapping="logical" distinct="true"><entity name="sec_proyecto"><attribute name="sec_proyectoid"/><attribute name="sec_name"/><order attribute="sec_name" descending="false"/><filter type="and"><condition attribute="statecode" operator="eq" value="${stateCode}"/></filter></entity></fetch>`;
        try {
            const result = await this._context.webAPI.retrieveMultipleRecords("sec_proyecto", `?fetchXml=${encodeURIComponent(fetchXml)}`);
            this._projects = result.entities;
            this.render();
        } catch (error) { console.error(error); }
    }

    private async _loadImputaciones(): Promise<void> {
        const weekDays = this.getWeekDays(this._currentWeekOffset);
        let projectFilter = this._selectedProjectId && this._selectedProjectId !== "ALL" 
            ? `<condition attribute="sec_proyectoid" operator="eq" value="${this._selectedProjectId}"/>` 
            : "";

        const fetchXmlHoras = `<fetch version="1.0" mapping="logical" distinct="true"><entity name="sec_partehoras"><attribute name="sec_fecha"/><attribute name="sec_tiempoimputado"/><attribute name="sec_descripcion"/><attribute name="ownerid"/><attribute name="sec_proyectoid"/><attribute name="sec_tareaproyectoid"/><filter type="and"><condition attribute="statecode" operator="eq" value="0"/>${projectFilter}<condition attribute="sec_fecha" operator="on-or-after" value="${weekDays[0].iso}"/><condition attribute="sec_fecha" operator="on-or-before" value="${weekDays[4].iso}"/></filter></entity></fetch>`;
        
        try {
            const result = await this._context.webAPI.retrieveMultipleRecords("sec_partehoras", `?fetchXml=${encodeURIComponent(fetchXmlHoras)}`);
            this._rawRecords = result.entities;
            const dataMap: any = {};
            
            this._rawRecords.forEach((reg: any) => {
                const userId = reg["_ownerid_value"];
                const userName = reg["_ownerid_value@OData.Community.Display.V1.FormattedValue"] || "Desconocido";
                const projectName = reg["_sec_proyectoid_value@OData.Community.Display.V1.FormattedValue"] || "N/A";
                const taskName = reg["_sec_tareaproyectoid_value@OData.Community.Display.V1.FormattedValue"] || "Tarea";
                const fechaKey = this._formatToKey(new Date(reg["sec_fecha"]));
                const horas = (reg["sec_tiempoimputado"] || 0) / 60;
                const desc = reg["sec_descripcion"] || "-";

                if (!dataMap[userId]) dataMap[userId] = { name: userName, hours: {}, details: {} };
                dataMap[userId].hours[fechaKey] = (dataMap[userId].hours[fechaKey] || 0) + horas;
                
                if (!dataMap[userId].details[fechaKey]) dataMap[userId].details[fechaKey] = [];
                dataMap[userId].details[fechaKey].push({ project: projectName, task: taskName, hours: horas.toFixed(2), comment: desc });
            });
            this._users = Object.values(dataMap);
            this.render();
        } catch (error) { console.error(error); }
    }

    private render(): void {
        this._container.innerHTML = "";
        const mainWrapper = document.createElement("div");
        mainWrapper.className = "pcf-main-wrapper rounded";

        const vTag = document.createElement("div");
        vTag.className = "version-tag";
        vTag.innerText = "v1.1.5";
        mainWrapper.appendChild(vTag);

        const title = document.createElement("h2");
        title.className = "pcf-title";
        title.innerText = "Informe semanal";
        mainWrapper.appendChild(title);

        // --- ZONA DE GRÁFICO ---
        if (this._rawRecords.length > 0) {
            mainWrapper.appendChild(this._createDonutSection());
        }

        const toolbar = document.createElement("div");
        toolbar.className = "pcf-toolbar";

        const leftGroup = document.createElement("div");
        leftGroup.className = "toolbar-left";

        const select = document.createElement("select");
        select.className = "modern-select rounded";
        select.innerHTML = `<option value="ALL">Todos los proyectos</option>`;
        this._projects.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.sec_proyectoid; opt.text = p.sec_name;
            if (p.sec_proyectoid === this._selectedProjectId) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e: any) => { this._selectedProjectId = e.target.value; this._loadImputaciones(); };

        const searchInput = document.createElement("input");
        searchInput.className = "search-input rounded";
        searchInput.placeholder = "Buscar usuario...";
        searchInput.value = this._searchText;
        searchInput.oninput = (e: any) => { this._searchText = e.target.value.toLowerCase(); this.render(); };

        const btnRefresh = document.createElement("button");
        btnRefresh.className = "btn-icon rounded";
        btnRefresh.innerHTML = "&#8635;";
        btnRefresh.onclick = () => this._loadImputaciones();

        leftGroup.appendChild(select);
        leftGroup.appendChild(searchInput);
        leftGroup.appendChild(btnRefresh);

        const weekDays = this.getWeekDays(this._currentWeekOffset);
        const weekNav = document.createElement("div");
        weekNav.className = "week-nav-container";
        weekNav.innerHTML = `<button class="nav-btn-img rounded" id="prev">&#9664;</button><button class="btn-today rounded" id="btnToday">Hoy</button><span class="week-range-text">${weekDays[0].labelShort} - ${weekDays[4].labelShort}</span><button class="nav-btn-img rounded" id="next">&#9654;</button>`;
        
        toolbar.appendChild(leftGroup);
        toolbar.appendChild(weekNav);
        mainWrapper.appendChild(toolbar);

        const tableContainer = document.createElement("div");
        tableContainer.className = "table-scroll-wrapper rounded";
        tableContainer.appendChild(this.createTable(weekDays));
        mainWrapper.appendChild(tableContainer);

        this._container.appendChild(mainWrapper);

        this._container.querySelector("#prev")?.addEventListener("click", () => { this._currentWeekOffset--; this._loadImputaciones(); });
        this._container.querySelector("#next")?.addEventListener("click", () => { this._currentWeekOffset++; this._loadImputaciones(); });
        this._container.querySelector("#btnToday")?.addEventListener("click", () => { this._currentWeekOffset = 0; this._loadImputaciones(); });
    }

    private _createDonutSection(): HTMLElement {
        const container = document.createElement("div");
        container.className = "donut-container rounded shadow";
        
        const isAll = this._selectedProjectId === "ALL";
        const statsMap: any = {};
        let totalHours = 0;

        this._rawRecords.forEach(reg => {
            const key = isAll 
                ? reg["_sec_proyectoid_value@OData.Community.Display.V1.FormattedValue"] 
                : reg["_sec_tareaproyectoid_value@OData.Community.Display.V1.FormattedValue"];
            const id = isAll ? reg["_sec_proyectoid_value"] : null;
            const h = (reg["sec_tiempoimputado"] || 0) / 60;
            totalHours += h;
            if (!statsMap[key]) statsMap[key] = { hours: 0, id: id };
            statsMap[key].hours += h;
        });

        const sortedStats = Object.keys(statsMap).map(k => ({ label: k, ...statsMap[k] })).sort((a,b) => b.hours - a.hours);
        const colors = ["#0078d4", "#2b88d8", "#5ca3e0", "#8dbdea", "#bed7f3", "#dff0ff"];

        let currentPercent = 0;
        const gradientParts = sortedStats.map((s, i) => {
            const start = currentPercent;
            const percent = (s.hours / totalHours) * 100;
            currentPercent += percent;
            return `${colors[i % colors.length]} ${start}% ${currentPercent}%`;
        });

        const chartTitle = document.createElement("div");
        chartTitle.className = "donut-title";
        chartTitle.innerText = isAll ? "Distribución por Proyecto" : "Distribución por Tarea";
        container.appendChild(chartTitle);

        const content = document.createElement("div");
        content.className = "donut-content";

        const chart = document.createElement("div");
        chart.className = "donut-graphic";
        chart.style.background = `conic-gradient(${gradientParts.join(", ")})`;
        
        const legend = document.createElement("div");
        legend.className = "donut-legend";

        sortedStats.forEach((s, i) => {
            const item = document.createElement("div");
            item.className = "legend-item";
            if (isAll) {
                item.style.cursor = "pointer";
                item.onclick = () => { this._selectedProjectId = s.id; this._loadImputaciones(); };
            }
            const p = ((s.hours / totalHours) * 100).toFixed(0);
            item.innerHTML = `<span class="dot" style="background:${colors[i % colors.length]}"></span> <strong>${p}%</strong> ${s.label}`;
            legend.appendChild(item);
        });

        content.appendChild(chart);
        content.appendChild(legend);
        container.appendChild(content);

        return container;
    }

    private createTable(weekDays: any[]): HTMLTableElement {
        const table = document.createElement("table");
        table.className = "imputation-table";
        const todayKey = this._formatToKey(new Date());
        const thead = table.createTHead();
        const hRow = thead.insertRow();
        const userHeader = hRow.insertCell();
        userHeader.innerHTML = "<strong>Usuario</strong>";
        userHeader.className = "user-column-header";

        weekDays.forEach(day => {
            const th = document.createElement("th");
            th.innerText = day.columnHeader;
            if (day.key === todayKey) th.className = "today-column";
            hRow.appendChild(th);
        });
        hRow.insertCell().innerHTML = "<strong>Total Sem.</strong>";

        const tbody = table.createTBody();
        const dailyTotals: any = {};
        const filteredUsers = this._users.filter(u => u.name.toLowerCase().includes(this._searchText));

        filteredUsers.forEach(user => {
            const row = tbody.insertRow();
            const cName = row.insertCell();
            cName.innerText = user.name;
            cName.className = "user-column";
            let userWeeklyTotal = 0;
            weekDays.forEach(day => {
                const cell = row.insertCell();
                const val = user.hours[day.key] || 0;
                userWeeklyTotal += val;
                dailyTotals[day.key] = (dailyTotals[day.key] || 0) + val;
                cell.innerText = val > 0 ? (Number.isInteger(val) ? val.toString() : val.toFixed(1)) : "0";
                if (val > 8) cell.className = "over-limit";
                if (day.key === todayKey) cell.classList.add("today-column-cell");
                if (user.details[day.key]) this._addAdvancedTooltip(cell, user.details[day.key]);
            });
            const tCell = row.insertCell();
            tCell.innerText = userWeeklyTotal.toFixed(1);
            tCell.className = userWeeklyTotal < 40 ? "weekly-total incomplete" : "weekly-total";
        });

        const tfoot = table.createTFoot();
        const fRow = tfoot.insertRow();
        fRow.insertCell().innerHTML = "<strong>TOTAL EQUIPO</strong>";
        weekDays.forEach(day => {
            const cell = fRow.insertCell();
            cell.innerText = (dailyTotals[day.key] || 0).toFixed(1);
            cell.className = "daily-total-footer";
        });
        fRow.insertCell().innerText = "-";
        return table;
    }

    private _addAdvancedTooltip(cell: HTMLTableCellElement, data: any[]) {
        cell.classList.add("has-advanced-tooltip");
        const tooltip = document.createElement("div");
        tooltip.className = "advanced-tooltip rounded-sm shadow";
        let html = `<div class="tooltip-header">Detalle de imputaciones</div><table class="tooltip-table"><thead><tr><th>Proy.</th><th>Tarea</th><th>H</th><th>Comentario</th></tr></thead><tbody>`;
        data.forEach(d => { html += `<tr><td>${d.project}</td><td>${d.task}</td><td>${d.hours}</td><td>${d.comment}</td></tr>`; });
        html += `</tbody></table>`;
        tooltip.innerHTML = html;
        cell.appendChild(tooltip);
    }

    private getWeekDays(offset: number) {
        const days = [];
        const today = new Date();
        const monday = new Date(today);
        const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
        monday.setDate(today.getDate() - (dayOfWeek - 1) + (offset * 7));
        const names = ["lu", "ma", "mi", "ju", "vi"];
        const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
        for (let i = 0; i < 5; i++) {
            const d = new Date(monday); d.setDate(monday.getDate() + i);
            const dStr = d.getDate().toString().padStart(2, '0');
            const mStr = (d.getMonth() + 1).toString().padStart(2, '0');
            days.push({ columnHeader: `${names[i]} ${dStr}/${mStr}`, labelShort: `${d.getDate()} ${months[d.getMonth()]}`, key: `${dStr}/${mStr}`, iso: d.toISOString().split('T')[0] });
        }
        return days;
    }

    private _formatToKey(date: Date): string {
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    public getOutputs(): IOutputs { return {}; }
    public destroy(): void { }
}