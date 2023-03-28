import Map, {NavigationControl, useControl} from 'react-map-gl';
import maplibregl from 'maplibre-gl';
import {GeoJsonLayer, ColumnLayer} from '@deck.gl/layers';

import React, { useState, useEffect, createElement, useRef } from 'react';

import {MapboxOverlay} from '@deck.gl/mapbox/typed';

import Slider from '@mui/material/Slider'
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import { Tooltip as MUITooltip } from '@mui/material';
import HelpIcon from '@mui/icons-material/Help';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import SettingsIcon from '@mui/icons-material/Settings';
import ManageHistoryIcon from '@mui/icons-material/ManageHistory';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';

import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import localizedFormat from "dayjs/plugin/localizedFormat";

import { Chart as ChartJS, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip } from "chart.js";
import { Line } from "react-chartjs-2";

import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

import { booleanContains, booleanIntersects, point, center } from '@turf/turf';

import { concatDataIndexes } from './Utils';
import Toolbar from './Toolbar';
import StatusPane from './StatusPane';

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);

ChartJS.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

function DeckGLOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

function DrawControl({onFinish}) {
  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
      polygon: false,
      trash: false
    },
    defaultMode: "draw_polygon"
  });
  const drawCreateCallback = ({features}) => {
    console.assert(features.length === 1);
    onFinish(features[0]);
  };
  useControl(
    () => draw,
    ({map}) => map.on("draw.create", drawCreateCallback),
    ({map}) => map.off("draw.create", drawCreateCallback),
    {});
  return null;
}

const style = {
  "version": 8,
      "sources": {
      "osm": {
              "type": "raster",
              "tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
              "tileSize": 256,
      "attribution": "&copy; OpenStreetMap Contributors",
      "maxzoom": 19
      }
  },
  "layers": [
      {
      "id": "osm",
      "type": "raster",
      "source": "osm", // This must match the source key above
      "paint": {
        "raster-contrast": -0.25
      }
      }
  ]
};

const emptyGeoJson = [];

const measurements = [
  {name: "C1", description: "Number of distinct devices in square"},
  {name: "C2", description: "Number of distinct roaming devices in square"},
  {name: "C3", description: "Placeholder"},
  {name: "C4", description: "Placeholder"},
  {name: "C5", description: "Placeholder"},
  {name: "C6", description: "Placeholder"},
  {name: "C7", description: "Placeholder"},
  {name: "C8", description: "Placeholder"},
  {name: "C9", description: "Placeholder"},
  {name: "C10", description: "Placeholder"},
  {name: "C11", description: "Placeholder"},
  {name: "E1", description: "Placeholder"},
  {name: "E2", description: "Placeholder"},
  {name: "E3", description: "Placeholder"},
  {name: "E4", description: "Placeholder"},
  {name: "E5", description: "Placeholder"},
  {name: "E7", description: "Placeholder"},
  {name: "E8", description: "Placeholder"},
  {name: "E9", description: "Placeholder"},
  {name: "E10", description: "Placeholder"}
];

function DateTimeWidget(props) {
  const [dateObj, setDateObj] = useState(dayjs(props.value, "YYYY-MM-DDTHH:mm:ss"));
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateTimePicker
        disabled={props.disabled}
        renderInput={(props) => <TextField {...props} />}
        label={props.label}
        value={dateObj}
        onChange={(newDateObj) => {
          setDateObj(newDateObj);
          props.onChange(newDateObj.format("YYYY-MM-DDTHH:mm:ss[Z]"));
        }} />
  </LocalizationProvider>
  );
}

function IconButtonWithTooltip(props) {
  const tooltip = props.tooltip;
  const iconComponent = props.iconComponent;

  const buttonProps = {...props};
  delete buttonProps.tooltip;
  delete buttonProps.iconComponent;

  return (
  <IconButton {...buttonProps}>
    <MUITooltip title={tooltip}>
      {createElement(iconComponent)}
    </MUITooltip>
  </IconButton>
  );
}

// ***************************
// Change these constants to true in order to fetch local data from the backend
// ***************************
const LOCAL_MONGODB = true;
const LOCAL_INFLUXDB = true;
// ***************************


const GRID_URL = LOCAL_MONGODB ? "http://localhost:5000/grid_local" : "http://localhost:5000/grid";
const HISTORY_URL = LOCAL_INFLUXDB ? "http://localhost:5000/data_range_local" : "http://localhost:5000/data_range";
const LIVE_URL = LOCAL_INFLUXDB ? "http://localhost:5000/mock_stream_local" : "http://localhost:5000/mock_stream";

const statuses = {
  loadingHistory: {caption: "Loading historical data..."},
  viewingHistory: {caption: "Viewing historical data"},
  loadingLive: {caption: "Loading live data..."},
  viewingLive: {caption: "Viewing live data"},
  viewingLiveNotTracking: {caption: "Not automatically tracking latest moment"},
  viewingLivePaused: {caption: "Live update paused (buffer limit reached)"},
  noData: {caption: "No data loaded"}
}

function App() {
  const [grid, setGrid] = useState(emptyGeoJson);
  const [rawData, setRawData] = useState([]);
  const [values, setValues] = useState([]);
  const [cumValues, setCumValues] = useState([]);

  useEffect(() => {
    fetch(GRID_URL)
      .then(r => r.json())
      .then(data => {
        data.sort((a, b) => a.properties.id - b.properties.id);
        setGrid(data);
        loadLive();
      });
  }, []);

  const [start, setStart] = useState("2022-08-01T00:00:00Z");
  const [end, setEnd] = useState("2022-08-02T00:00:00Z");
  const [everyNumber, setEveryNumber] = useState("1");
  const [everyUnit, setEveryUnit] = useState("h");

  const [selectedTimestamp, setSelectedTimestamp] = useState(0);

  const [visualization, setVisualization] = useState("absolute");

  function changeSelectedTimestamp(value) {
    setSelectedTimestamp(value);
    setValues(transformValuesToList(rawData, value, visualization));
  }

  function change(setter) {
    return event => setter(event.target.value);
  }

  const [status, setStatus] = useState(statuses.noData);
  const statusRef = useRef(statuses.noData);
  const previousStatusRef = useRef(statuses.noData);

  function changeStatus(s) {
    if(statusEquals(s, statusRef.current)) {
      console.log("changeStatus called with current status: " + s.current.caption);
      return;
    }

    previousStatusRef.current = statusRef.current;
    setStatus(s);
    statusRef.current = s;

    if(currentStatusIs(statuses.viewingLive)) {
      thumbStartBlinking();
      if(previousStatusIs(statuses.viewingLiveNotTracking)) {
        if(rawData.timestamps) {
          changeSelectedTimestamp(rawData.timestamps.length - 1);
        }
      } else {
        setNextTimeout();
      }
    } else {
      thumbStopBlinking();
    }
  }

  function statusEquals(s1, s2) {
    return s1 === s2;
  }

  function currentStatusIs(s) {
    return statusEquals(s, statusRef.current);
  }

  function previousStatusIs(s) {
    return statusEquals(s, previousStatusRef.current);
  }

  const freezeToolbar = currentStatusIs(statuses.loadingHistory) || currentStatusIs(statuses.loadingLive);
  const loadingHistory = currentStatusIs(statuses.loadingHistory);

  function load() {
    changeStatus(statuses.loadingHistory);
    const url = HISTORY_URL + "?start=" + start + "&end=" + end
      + "&every=" + everyNumber + everyUnit + "&measurement=" + measurement.name;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const setData = () => {
          changeStatus(statuses.viewingHistory);
          setRawData(data);
        };
        if(LOCAL_INFLUXDB) {
          setTimeout(setData, 5000); // simulate delay
        } else {
          setData();
        }
      });
  }

  function loadLive() {
    changeStatus(statuses.loadingLive);
    fetch(LIVE_URL)
      .then(r => r.json())
      .then(data => {
        changeStatus(statuses.viewingLive);
        setRawData(data);
      });
  }

  const lastTimestamp = useRef(null);

  useEffect(() => {
    if(!rawData.measurements)
      return;

    setValues(transformValuesToList(rawData, selectedTimestamp, visualization));
    setCumValues(transformCumValuesToList(rawData));
    lastTimestamp.current = rawData.timestamps[rawData.timestamps.length - 1];
    if(currentStatusIs(statuses.viewingLive))
      changeSelectedTimestamp(rawData.timestamps.length - 1);
    else if(currentStatusIs(statuses.viewingHistory))
      changeSelectedTimestamp(0);
  }, [rawData]);

  function changeVisualization(e) {
    setVisualization(e.target.value);
    setValues(transformValuesToList(rawData, selectedTimestamp, e.target.value));
  }

  const setNextTimeout = () => {
    if(currentStatusIs(statuses.viewingLive) || currentStatusIs(statuses.viewingLiveNotTracking))
      setTimeout(loadLiveNewData, 2500);
  }

  const [newData, setNewData] = useState(null);

  const loadLiveNewData = () => {
    const url = LIVE_URL + "?last_timestamp=" + lastTimestamp.current;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if(!data.timestamps || data.timestamps.length === 0) {
          setNextTimeout();
        } else {
          if(currentStatusIs(statuses.viewingLive) || currentStatusIs(statuses.viewingLiveNotTracking))
            setNewData(data);
        }
      });
  }

  const MAX_LIVE_BUFFER_SIZE = 20;

  function concatData(oldData, newData) {
    // Do not exceed max buffer size. Discard older data if necessary
    const old_length = oldData.timestamps.length;
    const new_length = newData.timestamps.length;
    if(old_length + new_length > MAX_LIVE_BUFFER_SIZE && currentStatusIs(statuses.viewingLiveNotTracking)) {
      changeStatus(statuses.viewingLivePaused);
      return;
    }
    const {first_old, first_new} = concatDataIndexes(old_length, new_length, MAX_LIVE_BUFFER_SIZE);

    const concatData = {timestamps: [], measurements: []};
    for(let i = first_old; i < old_length; ++i) {
      concatData.timestamps.push(oldData.timestamps[i]);
    }
    for(let i = first_new; i < new_length; ++i) {
      concatData.timestamps.push(newData.timestamps[i]);
    }
    for(let i = 0; i < oldData.measurements.length; ++i) {
      const ms = [];
      for(let j = first_old; j < old_length; ++j) {
        ms.push(oldData.measurements[i][j]);
      }
      for(let j = first_new; j < new_length; ++j) {
        ms.push(newData.measurements[i][j]);
      }
      concatData.measurements.push(ms);
    }
    setRawData(concatData);
    setNewData(null);
    if(currentStatusIs(statuses.viewingLive)) {
      changeSelectedTimestamp(concatData.timestamps.length - 1);
    }
    setNextTimeout();
  }

  // for blinking slider thumb when live
  const [thumbColor, setThumbColor] = useState("");
  const thumbColorRef = useRef("");
  const thumbBlinkingInterval = useRef(null);

  function thumbStartBlinking() {
    thumbBlinkingInterval.current = setInterval(() => {
      const color = thumbColorRef.current === "" ? "red" : "";
      thumbColorRef.current = color;
      setThumbColor(color);
    }, 500);
  }

  function thumbStopBlinking() {
    if(thumbBlinkingInterval.current) {
      clearInterval(thumbBlinkingInterval.current);
      thumbBlinkingInterval.current = null;
      thumbColorRef.current = "";
      setThumbColor("");
    }
  }

  useEffect(() => {
    if(!newData)
      return;

    concatData(rawData, newData);
  }, [newData]);

  function transformValuesToList(data, selectedTimestamp, visualization) {
    const measurements = data.measurements;
    const res = [];
    for(let i = 0; i < measurements.length; ++i) {
      const measurement = measurements[i];
      let value = measurement[selectedTimestamp];
      if(visualization == "density") {
        value = calcDensity(value, grid[i].properties.unusable_area);
      }
      res.push(value);
    }
    return res;
  }

  function gridDensity(grid_index) {
    if(!rawData.measurements)
      return 0;
    const measurement = rawData.measurements[grid_index];
    const value = measurement[selectedTimestamp];
    return calcDensity(value, grid[grid_index].properties.unusable_area);
  }

  function calcDensity(value, unusable_area) {
    const usable_area = 200 * 200 - unusable_area; // TODO actually calculate area of square
    const density = value / usable_area;
    return density.toFixed(3);
  }

  const percentColors = [
    { pct: 0.0, color: { r: 0x00, g: 0xff, b: 0 } },
    { pct: 0.05, color: { r: 0xff, g: 0xff, b: 0 } },
    { pct: 0.1, color: { r: 0xff, g: 0x00, b: 0 } } ];

  // https://stackoverflow.com/questions/7128675/from-green-to-red-color-depend-on-percentage
  function getColorForPercentage(pct) {
    let i;
    for (i = 1; i < percentColors.length - 1; i++) {
        if (pct < percentColors[i].pct) {
            break;
        }
    }
    let lower = percentColors[i - 1];
    let upper = percentColors[i];
    let range = upper.pct - lower.pct;
    let rangePct = (pct - lower.pct) / range;
    let pctLower = 1 - rangePct;
    let pctUpper = rangePct;
    let color = {
        r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
        g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
        b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
    };
    return [color.r, color.g, color.b, 100];
  };

  function transformCumValuesToList(data) {
    let squares = selectedSquares;
    if(selectedSquares.length === 0) {
      squares = [];
      for(let i = 0; i < data.measurements.length; ++i)
        squares.push(i);
    }

    const selectedSquaresCumValues = [];
    for(let i = 0; i < data.timestamps.length; ++i) {
      selectedSquaresCumValues.push(0);
    }
    for(const square of squares) {
      const squareMeasurements = data.measurements[square];
      for(let i = 0; i < squareMeasurements.length; ++i) {
        const squareMeasurement = squareMeasurements[i] ? squareMeasurements[i] : 0;
        selectedSquaresCumValues[i] += squareMeasurement;
      }
    }
    return selectedSquaresCumValues;
  }

  function sliderChange(_, value) {
    changeSelectedTimestamp(value);
    if(currentStatusIs(statuses.viewingLive) && value !== rawData.timestamps.length - 1)
      changeStatus(statuses.viewingLiveNotTracking);
  }

  function tooltip(index) {
    let html = "";
    if(visualization == "absolute") {
      html = `<span><b>${values[index]}</b> devices</span>`
    } else if(visualization == "density") {
      html = `<span><b>${gridDensity(index)}</b> devices/m<sup>2</sup></span>`
    } else {
      html = `<span><b>${values[index]}</b> devices<br /><b>${gridDensity(index)}</b> devices/m<sup>2</sup></span>`
    }
    return {html};
  }

  function formatTimestamp(timestamp) {
    const dateObj = dayjs(timestamp, "YYYY-MM-DDTHH:mm:ss");
    return dateObj.format("L LT");
  }

  const [drawing, setDrawing] = useState(false);
  const [drawControlOn, setDrawControlOn] = useState(false);

  useEffect(() => setDrawControlOn(drawing), [drawing]);

  function drawingFinished(polygon) {
    let squares = []; // squares that intersect the polygon
    for(let i = 0; i < grid.length; ++i) {
      const s = grid[i];
      if(booleanIntersects(polygon, s)) {
        squares.push(i);
      }
    }
    const selectedSquaresWithDups = [...selectedSquares, ...squares];
    const selectedSquaresSet = new Set(selectedSquaresWithDups);
    setSelectedSquares([...selectedSquaresSet]);

    setDrawing(false);
  }

  const [selectedSquares, setSelectedSquares] = useState([]);
  const [dontPick, setDontPick] = useState(false);

  // dontPick é hack para não selecionar quadrícula quando o utilizador faz o último click do desenho
  useEffect(() => drawing && setDontPick(true), [drawing]);
  
  function toggleSquare({lng, lat}) {
    if(dontPick) {
      setDontPick(false);
      return;
    }
    const p = point([lng, lat], {});
    let square = null;
    for(let i = 0; i < grid.length; ++i) {
      if(booleanContains(grid[i], p)) {
        square = i;
        break;
      }
    }
    if(square !== null) {
      if(selectedSquares.includes(square)) {
        setSelectedSquares(selectedSquares.filter(s => s !== square));
      } else {
        setSelectedSquares([...selectedSquares, square]);
      }
    }
  }

  useEffect(() => rawData.measurements && setCumValues(transformCumValuesToList(rawData)), [selectedSquares]);

  const [measurement, setMeasurement] = useState(measurements[0]);

  function chartPointColor(ctx) {
    if(ctx.dataIndex === selectedTimestamp) {
      if(currentStatusIs(statuses.viewingLive)) {
        return "red";
      } else {
        return "rgb(52, 213, 255)";
      }
    } else {
      return "rgb(60, 60, 60)";
    }
  }

  function liveButtonOnClick() {
    if(currentStatusIs(statuses.viewingHistory)) {
      loadLive();
    } else if(currentStatusIs(statuses.viewingLiveNotTracking) || currentStatusIs(statuses.viewingLivePaused)) {
      changeStatus(statuses.viewingLive);
    }
  }

  return (
    <div>
      <StatusPane status={status} />
      <Toolbar freeze={freezeToolbar} panes={[
        {title: "Visualization options", icon: <SettingsIcon/>, content:
          <Stack direction="row" spacing={2}>
            <TextField select value={visualization} sx={{width: 253}} label="Visualization" onChange={changeVisualization}>
              <MenuItem value="absolute" key="absolute">Number of devices</MenuItem>
              <MenuItem value="density" key="density">Density of devices</MenuItem>
              <MenuItem value="both" key="both">Number + density of devices</MenuItem>
            </TextField>
            <IconButtonWithTooltip tooltip="Play animation" iconComponent={PlayArrowIcon} />
            <IconButtonWithTooltip tooltip="Go to previous critical point" iconComponent={SkipPreviousIcon} />
            <IconButtonWithTooltip tooltip="Go to next critical point" iconComponent={SkipNextIcon} />
            <IconButtonWithTooltip tooltip="Draw area of interest" onClick={() => setDrawing(true)} iconComponent={EditIcon} />
            <IconButtonWithTooltip tooltip="Clear selection" onClick={() => setSelectedSquares([])} iconComponent={DeleteIcon} />
          </Stack>},
        {title: "History", icon: <ManageHistoryIcon/>, stayOnFreeze: true, content:
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <DateTimeWidget label="Start" value={start} onChange={setStart} disabled={loadingHistory} />
              <DateTimeWidget label="End" value={end} onChange={setEnd} disabled={loadingHistory} />
            </Stack>
            <Stack direction="row" spacing={2} sx={{textAlign: "center"}} maxWidth={true} float="left">
              <TextField type="number" label="Interval" sx={{width: 75}} value={everyNumber} onChange={e => setEveryNumber(e.target.value)} disabled={loadingHistory} />
              <TextField select value={everyUnit} label="Unit" onChange={change(setEveryUnit)} sx={{width: 95}} disabled={loadingHistory} >
                <MenuItem value="m" key="m">Minute</MenuItem>
                <MenuItem value="h" key="h">Hour</MenuItem>
                <MenuItem value="d" key="d">Day</MenuItem>
                <MenuItem value="w" key="w">Week</MenuItem>
                <MenuItem value="mo" key="mo">Month</MenuItem>
              </TextField>
              <span style={{position: "relative", top:"15px"}}>
                <MUITooltip title="Interval defines the time window that will be used to aggregate and average the data">
                  <HelpIcon />
                </MUITooltip>
              </span>
              <span style={{width: "247px", textAlign: "right"}}>
                <TextField select label="Measurement" sx={{width: 100}} value={measurement} onChange={change(setMeasurement)} SelectProps={{renderValue: (m) => m.name}} disabled={loadingHistory} >
                  {measurements.map(m => (
                    <MenuItem value={m} key={m.name}>{m.name + " - " + m.description}</MenuItem>
                  ))}
                </TextField>
              </span>
            </Stack>
            <div style={{position: "relative", width: "100%", textAlign: "center"}}>
              {loadingHistory ? <Button variant="contained">Cancel</Button> : <Button variant="contained" onClick={load}>Load</Button>}
            </div>
          </Stack>},
        {title: "Points", icon: <TroubleshootIcon/>, content:
          <p>Not implemented yet</p>
        }]} />
      <div style={{position: "absolute", top: "0px", left: "60px", right: "0px", zIndex: 100, padding: "10px 25px 10px 25px", borderRadius: "25px", backgroundColor: "rgba(224, 224, 224, 1.0)"}}>
        <Stack direction="row" spacing={10}>
          <Slider step={1} min={0} max={rawData.timestamps ? rawData.timestamps.length - 1 : 0} value={selectedTimestamp} valueLabelDisplay="auto" onChange={sliderChange} valueLabelFormat={i => rawData.timestamps ? formatTimestamp(rawData.timestamps[i]) : "No data loaded"} sx={{zIndex: 1, "& .MuiSlider-thumb": { color: thumbColor}, "& .MuiSlider-valueLabel.MuiSlider-valueLabelOpen": { transform: "translateY(125%) scale(1)" }, "& .MuiSlider-valueLabel:before": { transform: "translate(-50%, -300%) rotate(45deg)" }}} />
          <Button variant="contained" onClick={liveButtonOnClick}>Live</Button>
        </Stack>
      </div>
      <div style={{position: "absolute", top: "0px", bottom: "0px", width: "100%"}}>
        <Map mapLib={maplibregl} mapStyle={style} initialViewState={{longitude: -9.22502725720, latitude: 38.69209409900, zoom: 15, pitch: 30}}
          onClick={(e) => !drawing && toggleSquare(e.lngLat)}
          onDblClick={(e) => e.preventDefault()}>
          <DeckGLOverlay layers={
            [new GeoJsonLayer({
              id: "quadricula",
              data: grid,
              filled: true,
              getLineWidth: 5,
              getLineColor: [120, 120, 120, 255],
              getFillColor: (_, info) => selectedSquares.includes(info.index) ? [138, 138, 0, 100] : [0, 0, 0, 0],
              updateTriggers: {
                getFillColor: [selectedSquares]
              }
            }),
            new ColumnLayer({
              id: "barras",
              data: values,
              radius: 25,
              pickable: true,
              getElevation: value => visualization == "density" ? value * 15000 : value,
              getPosition: (_, info) => center(grid[info.index]).geometry.coordinates,
              getFillColor: (_, info) => visualization == "both" ? getColorForPercentage(gridDensity(info.index)) : [0, 0, 139, 100]
            })]}
            getTooltip={(o) => o.picked && tooltip(o.index)} />
          {/* <NavigationControl /> */}
          {drawControlOn && 
            <DrawControl onFinish={drawingFinished} />}
        </Map>
      </div>
      {visualization == "absolute" &&
        <div style={{position: "absolute", bottom: "0px", left: "0px", height: "30%", width: "30%", zIndex: 100, backgroundColor: "rgba(224, 224, 224, 1.0)"}}>
          <Line
            data={{labels: rawData.timestamps ? rawData.timestamps.map(formatTimestamp) : [], datasets: [{data: cumValues, borderColor: 'rgb(60, 60, 60)', pointBackgroundColor: chartPointColor}]}}
            options={{scales: {x: {display: false}}}} />
        </div>}
    </div>
  );
}

export default App;
