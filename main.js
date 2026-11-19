const W = 900, H = 540, M = { top: 20, right: 30, bottom: 56, left: 70 };
const COLORS = { "Public": "#2b6fb0", "Private nonprofit": "#e0702f", "Private for-profit": "#8a8a8a" };
const ANNOTATE = ["University of California-San Diego", "Stanford University"];
const fmtK = v => "$" + d3.format(".1f")(v / 1000) + "K";

let mode = "sticker";
let selected = null;
const activeTypes = new Set(Object.keys(COLORS));

const svg = d3.select("#chart").append("svg").attr("viewBox", `0 0 ${W} ${H}`);
const x = d3.scaleLinear().range([M.left, W - M.right]);
const y = d3.scaleLinear().range([H - M.bottom, M.top]);

const gridY = svg.append("g").attr("class", "grid").attr("transform", `translate(${M.left},0)`);
const xAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - M.bottom})`);
const yAxis = svg.append("g").attr("class", "axis").attr("transform", `translate(${M.left},0)`);
const xLabel = svg.append("text").attr("class", "axis-label").attr("x", (M.left + W - M.right) / 2).attr("y", H - 14).attr("text-anchor", "middle");
svg.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)")
  .attr("x", -(M.top + H - M.bottom) / 2).attr("y", 20).attr("text-anchor", "middle")
  .text("Median earnings 10 years after entry");
const trend = svg.append("path").attr("class", "trend");
const dotsG = svg.append("g");
const annotG = svg.append("g").attr("class", "annot");
const tip = d3.select("#tooltip");

const costOf = d => mode === "sticker" ? d.sticker_cost : d.net_price;

d3.csv("data.csv", d3.autoType).then(raw => {
  const data = raw.filter(d => d.sticker_cost && d.median_earnings_10yr);
  d3.select("#schools").selectAll("option").data(data.map(d => d.name).sort()).join("option").attr("value", d => d);

  y.domain([0, d3.max(data, d => d.median_earnings_10yr) * 1.05]).nice();
  yAxis.call(d3.axisLeft(y).tickFormat(d => "$" + d / 1000 + "K"));
  gridY.call(d3.axisLeft(y).tickSize(-(W - M.left - M.right)).tickFormat(""));

  const dots = dotsG.selectAll("circle").data(data, d => d.name).join("circle")
    .attr("class", "dot").attr("r", 3.6).attr("fill", d => COLORS[d.type]).attr("opacity", .7)
    .attr("cy", d => y(d.median_earnings_10yr))
    .on("mousemove", (e, d) => {
      tip.attr("hidden", null).html(
        `<b>${d.name}</b>${d.state} · ${d.type}<br>` +
        `Sticker price: ${fmtK(d.sticker_cost)}/yr<br>` +
        `Net price: ${d.net_price ? fmtK(d.net_price) + "/yr" : "n/a"}<br>` +
        `Earnings (10 yr): ${fmtK(d.median_earnings_10yr)}<br>` +
        `Median debt: ${d.median_debt ? fmtK(d.median_debt) : "n/a"}<br>` +
        `Grad rate: ${d.grad_rate != null ? Math.round(d.grad_rate * 100) + "%" : "n/a"}`)
        .style("left", Math.min(e.clientX + 14, window.innerWidth - 270) + "px")
        .style("top", (e.clientY + 14) + "px");
    })
    .on("mouseleave", () => tip.attr("hidden", true))
    .on("click", (e, d) => select(d.name));

  function visible(d) { return activeTypes.has(d.type) && costOf(d) != null; }

  function update(animate = true) {
    const vis = data.filter(visible);
    x.domain([0, d3.max(data, d => d.sticker_cost) * 1.02]).nice();
    xAxis.transition().duration(animate ? 700 : 0).call(d3.axisBottom(x).tickFormat(d => "$" + d / 1000 + "K"));
    xLabel.text(mode === "sticker" ? "Sticker price per year (full cost of attendance)" : "Net price per year (what students pay after aid)");

    dots.transition().duration(animate ? 900 : 0)
      .attr("cx", d => costOf(d) != null ? x(costOf(d)) : x(0))
      .attr("opacity", d => visible(d) ? (selected && d.name !== selected && !ANNOTATE.includes(d.name) ? .15 : .75) : 0);
    dots.style("pointer-events", d => visible(d) ? "auto" : "none")
      .classed("hl", d => d.name === selected).attr("r", d => d.name === selected ? 7 : 3.6);
    dots.filter(d => d.name === selected).raise();

    // least-squares trend line on visible points
    if (vis.length > 2) {
      const mx = d3.mean(vis, costOf), my = d3.mean(vis, d => d.median_earnings_10yr);
      const b = d3.sum(vis, d => (costOf(d) - mx) * (d.median_earnings_10yr - my)) / d3.sum(vis, d => (costOf(d) - mx) ** 2);
      const a = my - b * mx;
      const [x0, x1] = d3.extent(vis, costOf);
      trend.transition().duration(animate ? 900 : 0)
        .attr("d", d3.line()([[x(x0), y(a + b * x0)], [x(x1), y(a + b * x1)]])).attr("opacity", .6);
    } else trend.attr("opacity", 0);

    // annotations: reference schools + selected school
    const names = [...new Set([...ANNOTATE, ...(selected ? [selected] : [])])];
    const ann = data.filter(d => names.includes(d.name) && visible(d));
    const g = annotG.selectAll("g").data(ann, d => d.name).join(
      enter => { const g = enter.append("g"); g.append("line"); g.append("text"); return g; });
    g.transition().duration(animate ? 900 : 0).attr("transform", d => `translate(${x(costOf(d))},${y(d.median_earnings_10yr)})`);
    g.select("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", -22);
    g.select("text").attr("y", -27).attr("text-anchor", d => x(costOf(d)) > W - 160 ? "end" : "middle")
      .text(d => `${d.name.replace("University of California-", "UC ")}: ${fmtK(costOf(d))}`);

    const readout = d3.select("#readout");
    if (selected) {
      const d = data.find(s => s.name === selected);
      const rank = data.filter(s => s.net_price && s.undergrads >= 1000)
        .sort((p, q) => q.median_earnings_10yr / q.net_price - p.median_earnings_10yr / p.net_price)
        .findIndex(s => s.name === selected) + 1;
      readout.html(`<b>${d.name}</b>: sticker ${fmtK(d.sticker_cost)}, net ${d.net_price ? fmtK(d.net_price) : "n/a"}, earnings ${fmtK(d.median_earnings_10yr)}` +
        (rank > 0 ? `. Rank <b>#${rank}</b> of ${data.filter(s => s.net_price && s.undergrads >= 1000).length} on earnings per dollar of net price.` : "."));
    } else {
      readout.html(`Showing <b>${vis.length.toLocaleString()}</b> schools. Correlation between ${mode === "sticker" ? "sticker" : "net"} price and earnings: <b>r = ${corr(vis).toFixed(2)}</b>.`);
    }
  }

  function corr(v) {
    const mx = d3.mean(v, costOf), my = d3.mean(v, d => d.median_earnings_10yr);
    let n = 0, a = 0, b = 0;
    v.forEach(d => { const dx = costOf(d) - mx, dy = d.median_earnings_10yr - my; n += dx * dy; a += dx * dx; b += dy * dy; });
    return n / Math.sqrt(a * b);
  }

  function select(name) {
    selected = data.some(d => d.name === name) ? name : null;
    d3.select("#search").property("value", selected || "");
    update();
  }

  d3.selectAll(".toggle button").on("click", function () {
    mode = this.dataset.mode;
    d3.selectAll(".toggle button").classed("active", false);
    d3.select(this).classed("active", true);
    update();
  });
  d3.selectAll(".filters input").on("change", function () {
    this.checked ? activeTypes.add(this.value) : activeTypes.delete(this.value);
    update();
  });
  d3.select("#search").on("change", function () { select(this.value); });
  d3.select("#clear").on("click", () => select(null));

  update(false);
});
