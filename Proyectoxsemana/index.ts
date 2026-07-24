import { IInputs, IOutputs } from "./generated/ManifestTypes";

export class WeeklyTimesheet implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _context: ComponentFramework.Context<IInputs>;
    
    // View State
    private _viewMode: 'WEEKLY' | 'RESOURCE' = 'WEEKLY';
    
    // Weekly Report State
    private _currentWeekOffset: number = 0;
    private _showActive: boolean = true;
    private _projects: any[] = [];
    private _users: any[] = [];
    private _selectedProjectId: string = "ALL";
    private _searchText: string = "";
    private _rawRecords: any[] = [];

    // Resource Report State
    private _resourceTasks: any[] = [];
    private _selectedResourceId: string = "ALL";

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

    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        const t = document.getElementById("pcf-active-tooltip");
        if (t) t.remove();
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

                if (!dataMap[userId]) dataMap[userId] = { name: userName, hours: {}, details: {}, weeklyTotal: 0 };
                dataMap[userId].hours[fechaKey] = (dataMap[userId].hours[fechaKey] || 0) + horas;
                dataMap[userId].weeklyTotal += horas;
                
                if (!dataMap[userId].details[fechaKey]) dataMap[userId].details[fechaKey] = [];
                dataMap[userId].details[fechaKey].push({ project: projectName, task: taskName, hours: horas.toFixed(2), comment: desc });
            });
            this._users = Object.values(dataMap);
            this.render();
        } catch (error) { console.error(error); }
    }

    private async _loadResourceTasks(): Promise<void> {
        const fetchXml = `<fetch>
            <entity name="sec_miembrodelequipo">
                <attribute name="sec_usuarioid" />
                <link-entity name="sec_tarea" from="sec_tareaid" to="sec_tareadeproyectoid" link-type="inner" alias="TDP">
                    <attribute name="sec_esfuerzoestimado" />
                    <attribute name="sec_horasimputadas" />
                    <attribute name="sec_idtarea" />
                    <attribute name="sec_name" />
                    <attribute name="sec_proyectoid" />
                    <filter>
                        <condition attribute="sec_horasimputadas" operator="lt" valueof="sec_estimado" />
                        <condition attribute="statuscode" operator="in">
                            <value>1</value>
                            <value>919690001</value>
                        </condition>
                    </filter>
                </link-entity>
            </entity>
        </fetch>`;
        
        try {
            const result = await this._context.webAPI.retrieveMultipleRecords("sec_miembrodelequipo", `?fetchXml=${encodeURIComponent(fetchXml)}`);
            this._resourceTasks = result.entities;
            this.render();
        } catch (error) { console.error(error); }
    }

    private render(): void {
        this._container.innerHTML = "";
        const mainWrapper = document.createElement("div");
        mainWrapper.className = "pcf-main-wrapper rounded";

        const vTag = document.createElement("div");
        vTag.className = "version-tag";
        vTag.innerText = "v2.0.4";
        mainWrapper.appendChild(vTag);

        // Cabecera con título y selector de vista
        const headerContainer = document.createElement("div");
        headerContainer.className = "header-container";

        const title = document.createElement("h2");
        title.className = "pcf-title";
        title.innerText = "Panel de Control";

        const toggleContainer = document.createElement("div");
        toggleContainer.className = "view-toggle-container";

        const btnWeekly = document.createElement("button");
        btnWeekly.className = `view-toggle-btn ${this._viewMode === 'WEEKLY' ? 'active' : ''}`;
        btnWeekly.innerText = "Informe Semanal";
        btnWeekly.onclick = () => { 
            this._viewMode = 'WEEKLY'; 
            this.render(); 
        };

        const btnResource = document.createElement("button");
        btnResource.className = `view-toggle-btn ${this._viewMode === 'RESOURCE' ? 'active' : ''}`;
        btnResource.innerText = "Informe por Recurso";
        btnResource.onclick = () => { 
            this._viewMode = 'RESOURCE'; 
            this._loadResourceTasks(); 
        };

        toggleContainer.appendChild(btnWeekly);
        toggleContainer.appendChild(btnResource);
        
        headerContainer.appendChild(title);
        headerContainer.appendChild(toggleContainer);
        mainWrapper.appendChild(headerContainer);

        // Renderizado condicional basado en la vista activa
        if (this._viewMode === 'WEEKLY') {
            this._renderWeeklyView(mainWrapper);
        } else {
            this._renderResourceView(mainWrapper);
        }

        this._container.appendChild(mainWrapper);
    }

    private _renderWeeklyView(mainWrapper: HTMLDivElement): void {
        if (this._rawRecords.length > 0) {
            const dashboard = document.createElement("div");
            dashboard.className = "pcf-dashboard";
            dashboard.appendChild(this._createDonutSection());
            dashboard.appendChild(this._createWeeklyBarChart());
            mainWrapper.appendChild(dashboard);
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
        weekNav.innerHTML = `
            <button class="nav-btn-img-circular" id="prev">&#9664;</button>
            <button class="btn-today-original" id="btnToday">Hoy</button>
            <span class="week-range-text-original">${weekDays[0].labelShort} - ${weekDays[4].labelShort}</span>
            <button class="nav-btn-img-circular" id="next">&#9654;</button>
        `;
        
        toolbar.appendChild(leftGroup);
        toolbar.appendChild(weekNav);
        mainWrapper.appendChild(toolbar);

        const tableContainer = document.createElement("div");
        tableContainer.className = "table-outer-box";
        tableContainer.appendChild(this.createTable(weekDays));
        mainWrapper.appendChild(tableContainer);

        // Listeners
        weekNav.querySelector("#prev")?.addEventListener("click", () => { this._currentWeekOffset--; this._loadImputaciones(); });
        weekNav.querySelector("#next")?.addEventListener("click", () => { this._currentWeekOffset++; this._loadImputaciones(); });
        weekNav.querySelector("#btnToday")?.addEventListener("click", () => { this._currentWeekOffset = 0; this._loadImputaciones(); });
    }

    private _renderResourceView(mainWrapper: HTMLDivElement): void {
        const toolbar = document.createElement("div");
        toolbar.className = "pcf-toolbar";
        
        // Agrupar tareas por recurso basado en la entidad sec_miembrodelequipo
        const resourceMap: any = {};
        this._resourceTasks.forEach(t => {
            const rId = t["_sec_usuarioid_value"];
            const rName = t["_sec_usuarioid_value@OData.Community.Display.V1.FormattedValue"] || "Desconocido";
            
            if (rId && !resourceMap[rId]) {
                resourceMap[rId] = { id: rId, name: rName, tasks: [] };
            }
            if (rId) {
                resourceMap[rId].tasks.push(t);
            }
        });
        const resources = Object.values(resourceMap).sort((a: any, b: any) => a.name.localeCompare(b.name));

        const select = document.createElement("select");
        select.className = "modern-select rounded";
        select.innerHTML = `<option value="ALL">Todos los recursos</option>`;
        resources.forEach((r: any) => {
            const opt = document.createElement("option");
            opt.value = r.id; 
            opt.text = r.name;
            if (r.id === this._selectedResourceId) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e: any) => { this._selectedResourceId = e.target.value; this.render(); };

        const btnRefresh = document.createElement("button");
        btnRefresh.className = "btn-icon rounded";
        btnRefresh.innerHTML = "&#8635;";
        btnRefresh.onclick = () => this._loadResourceTasks();

        // Botón Exportar CSV
        const btnExport = document.createElement("button");
        btnExport.className = "btn-export";
        btnExport.innerHTML = "Exportar a CSV";
        btnExport.onclick = () => this._exportResourceToCsv(resources);

        const leftGroup = document.createElement("div");
        leftGroup.className = "toolbar-left";
        leftGroup.appendChild(select);
        leftGroup.appendChild(btnRefresh);
        leftGroup.appendChild(btnExport);
        toolbar.appendChild(leftGroup);
        mainWrapper.appendChild(toolbar);

        const tableContainer = document.createElement("div");
        tableContainer.className = "table-outer-box";
        
        const table = document.createElement("table");
        table.className = "imputation-table";
        const thead = table.createTHead();
        const hRow = thead.insertRow();
        hRow.innerHTML = `<th class="user-column-header" style="text-align: left;"><strong>Recurso</strong></th><th>Proyecto</th><th>Tarea</th><th>Horas Pendientes</th>`;

        const tbody = table.createTBody();

        resources.forEach((r: any) => {
            // Filtrar si hay un recurso seleccionado
            if (this._selectedResourceId !== "ALL" && r.id !== this._selectedResourceId) return;

            r.tasks.forEach((t: any, index: number) => {
                const tr = tbody.insertRow();
                
                // Agrupar filas del recurso usando rowSpan en la primera tarea
                if (index === 0) {
                    const tdRes = tr.insertCell();
                    tdRes.innerHTML = `<strong>${r.name}</strong>`;
                    tdRes.rowSpan = r.tasks.length;
                    tdRes.style.verticalAlign = "middle";
                    tdRes.className = "user-column";
                }
                
                const tdProj = tr.insertCell();
                // Extraer el nombre del proyecto formateado a través del alias "TDP"
                const projectName = t["TDP.sec_proyectoid@OData.Community.Display.V1.FormattedValue"] 
                                 || t["_TDP.sec_proyectoid_value@OData.Community.Display.V1.FormattedValue"] 
                                 || "-";
                tdProj.innerText = projectName;
                
                const tdTask = tr.insertCell();
                // Al ser un link-entity con alias "TDP", los valores de texto base vienen con el prefijo
                tdTask.innerText = t["TDP.sec_name"] || "Tarea sin nombre";
                
                const tdHours = tr.insertCell();
                const estimado = t["TDP.sec_esfuerzoestimado"] || 0;
                const imputadas = t["TDP.sec_horasimputadas"] || 0;
                const hp = estimado - imputadas;
                
                tdHours.innerText = hp > 0 ? hp.toString() : "0";
                tdHours.style.fontWeight = "bold";
                tdHours.style.color = "#0078d4";
            });
        });
        
        if (resources.length === 0 || tbody.rows.length === 0) {
            const tr = tbody.insertRow();
            const td = tr.insertCell();
            td.colSpan = 4;
            td.innerText = "No hay tareas abiertas con horas pendientes.";
            td.style.padding = "30px";
            td.style.color = "#888";
        }

        tableContainer.appendChild(table);
        mainWrapper.appendChild(tableContainer);
    }

    private _exportResourceToCsv(resources: any[]): void {
        let csvContent = "Recurso,Proyecto,Tarea,Horas Pendientes\n";

        resources.forEach((r: any) => {
            // Respetamos el filtro si hay un recurso seleccionado
            if (this._selectedResourceId !== "ALL" && r.id !== this._selectedResourceId) return;

            r.tasks.forEach((t: any) => {
                // Limpiar y envolver textos entre comillas para evitar que comas internas rompan el CSV
                const resName = `"${r.name.replace(/"/g, '""')}"`;
                
                const projectNameRaw = t["TDP.sec_proyectoid@OData.Community.Display.V1.FormattedValue"] 
                                    || t["_TDP.sec_proyectoid_value@OData.Community.Display.V1.FormattedValue"] 
                                    || "-";
                const projectName = `"${projectNameRaw.replace(/"/g, '""')}"`;
                
                const taskNameRaw = t["TDP.sec_name"] || "Tarea sin nombre";
                const taskName = `"${taskNameRaw.replace(/"/g, '""')}"`;
                
                const estimado = t["TDP.sec_esfuerzoestimado"] || 0;
                const imputadas = t["TDP.sec_horasimputadas"] || 0;
                const hp = estimado - imputadas;
                const hours = hp > 0 ? hp : 0;

                csvContent += `${resName},${projectName},${taskName},${hours}\n`;
            });
        });

        // Generar Blob con BOM (\uFEFF) para forzar que Excel lo abra en UTF-8 directamente
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `HorasPendientes_${this._formatToKey(new Date()).replace('/', '-')}.csv`);
        
        // Simular clic para descargar
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
        const colors = ["#0078d4", "#2b88d8", "#5ca3e0", "#8dbdea", "#bed7f3", "#a9d1f7", "#81b1e1"];

        let currentPercent = 0;
        const gradientParts = sortedStats.map((s, i) => {
            const start = currentPercent;
            const percent = (s.hours / totalHours) * 100;
            currentPercent += percent;
            return `${colors[i % colors.length]} ${start}% ${currentPercent}%`;
        });

        const chartTitle = document.createElement("div");
        chartTitle.className = "chart-title";
        chartTitle.innerText = isAll ? "PROYECTOS" : "TAREAS";
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

    private _createWeeklyBarChart(): HTMLElement {
        const container = document.createElement("div");
        container.className = "bar-chart-container rounded shadow";
        const chartTitle = document.createElement("div");
        chartTitle.className = "chart-title";
        chartTitle.innerText = "ACUMULADO SEMANAL / 40H";
        container.appendChild(chartTitle);

        const barsWrapper = document.createElement("div");
        barsWrapper.className = "bars-wrapper";

        const displayUsers = this._users
            .filter(u => u.name.toLowerCase().includes(this._searchText))
            .sort((a,b) => b.weeklyTotal - a.weeklyTotal);

        displayUsers.forEach(user => {
            const barRow = document.createElement("div");
            barRow.className = "bar-row";
            const nameLabel = document.createElement("div");
            nameLabel.className = "bar-name";
            nameLabel.innerText = user.name.split(' ')[0];
            const barBackground = document.createElement("div");
            barBackground.className = "bar-background";
            const barFill = document.createElement("div");
            barFill.className = "bar-fill";
            const percentage = Math.min((user.weeklyTotal / 40) * 100, 100);
            barFill.style.width = `${percentage}%`;
            if (user.weeklyTotal > 40) barFill.classList.add("over-40");
            const hoursLabel = document.createElement("div");
            hoursLabel.className = "bar-hours";
            hoursLabel.innerText = `${user.weeklyTotal.toFixed(1)}h`;
            barBackground.appendChild(barFill);
            barRow.appendChild(nameLabel);
            barRow.appendChild(barBackground);
            barRow.appendChild(hoursLabel);
            barsWrapper.appendChild(barRow);
        });
        container.appendChild(barsWrapper);
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
        const totalHeader = hRow.insertCell();
        totalHeader.innerHTML = "<strong>Total Sem.</strong>";

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
        const fLabel = fRow.insertCell();
        fLabel.innerHTML = "<strong>TOTAL EQUIPO</strong>";
        weekDays.forEach(day => {
            const cell = fRow.insertCell();
            cell.innerText = (dailyTotals[day.key] || 0).toFixed(1);
            cell.className = "daily-total-footer";
        });
        fRow.insertCell().innerText = "-";
        return table;
    }

    private _addAdvancedTooltip(cell: HTMLTableCellElement, data: any[]): void {
        cell.classList.add("has-advanced-tooltip");
        cell.onmouseenter = () => {
            const tooltip = document.createElement("div");
            tooltip.id = "pcf-active-tooltip";
            tooltip.className = "advanced-tooltip-fixed rounded-sm shadow";
            let html = `<div class="tooltip-header">Detalle de imputaciones</div><table class="tooltip-table"><thead><tr><th>Proy.</th><th>Tarea</th><th>H</th><th>Comentario</th></tr></thead><tbody>`;
            data.forEach(d => { html += `<tr><td>${d.project}</td><td>${d.task}</td><td>${d.hours}</td><td>${d.comment}</td></tr>`; });
            html += `</tbody></table>`;
            tooltip.innerHTML = html;
            document.body.appendChild(tooltip);
            const rect = cell.getBoundingClientRect();
            tooltip.style.top = `${rect.bottom + 10 + window.scrollY}px`;
            tooltip.style.left = `${rect.left + (rect.width / 2) - 200}px`;
        };
        cell.onmouseleave = () => {
            const t = document.getElementById("pcf-active-tooltip");
            if (t) t.remove();
        };
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
}