// Define a global object to hold all map related operations
var MapApp = {
    mapboxToken: 'pk.eyJ1IjoidW5oY3IiLCJhIjoiY2xhdGVmdjBoMDAwaTN3cDh4M2swdWMydyJ9.cYfxlbJadmlPsmnoincZsw',
    map: null,
    layerData: {
        ref: { url: "https://data.unhcr.org/population/get/sublocation/root?widget_id=446020&geo_id=591&population_group=5556&forcesublocation=true&fromDate=1900-01-01", data: null, maxVal: 0 },
        //ref_bhasan: { url: "https://data.unhcr.org/population/?widget_id=446025&geo_id=591&population_group=5553", data: null, maxVal: 0 }
    },

    initializeMap: function() {
        mapboxgl.accessToken = this.mapboxToken;
        this.map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/unhcr/clbaspvlx008p14nwrwo06ox6',
            center: [91.1398552, 22.9336065],
            zoom: 3,
            projection: 'globe'
        });
        
        this.map.on('load', () => {
            this.map.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
            this.map.setLights([{
                "id": "sun_light",
                "type": "directional",
                "properties": {
                "color": "rgba(255.0, 0.0, 0.0, 1.0)",
                "intensity": 0.4,
                "direction": [200.0, 40.0],
                "cast-shadows": true,
                "shadow-intensity": 0.2
                }
            }]);
            this.map.setFog({
                color: 'rgba(120, 144, 156, 0.5)',
                'high-color': 'rgba(40, 54, 85, 0.5)',
                'horizon-blend': 0.1,
                'space-color': 'rgb(5, 5, 15)',
                'star-intensity': 0.75
            });
            this.addNavigationControl();
            this.loadLayerData();
            this.setupLayerSwitchers();

            this.loadAllImages(); // First, load all images
            this.loadAllCSVs(); // Then, load all CSV data
            this.addAllLayers(); // Finally, add all layers
        });

        // Inside initializeMap or after map is fully loaded
        this.map.on('click', 'ref-clusters', (e) => {
            var features = this.map.queryRenderedFeatures(e.point, { layers: ['ref-clusters'] });
            var clusterId = features[0].properties.cluster_id;
            this.map.getSource('ref').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;

                this.map.easeTo({
                    center: features[0].geometry.coordinates,
                    zoom: zoom
                });
            });
        });

        // Cursor styling for clusters
        this.map.on('mouseenter', 'ref-clusters', () => this.map.getCanvas().style.cursor = 'pointer');
        this.map.on('mouseleave', 'ref-clusters', () => this.map.getCanvas().style.cursor = '');
    },

    addNavigationControl: function() {
        var nav = new mapboxgl.NavigationControl();
        this.map.addControl(nav, 'bottom-right');
    },

    loadLayerData: function() {
        Object.keys(this.layerData).forEach(key => {
            $.getJSON(this.layerData[key].url, data => {
                this.processLayerData(key, data);
            });
        });
    },

    processLayerData: function(layerId, result) {
        // Initialize the FeatureCollection for the layer
        let featureCollection = {
            type: "FeatureCollection",
            features: []
        };
    
        let maxValue = 0;
    
        // Loop through the data to construct GeoJSON features
        result.data.forEach(item => {
            let feature = {
                type: "Feature",
                properties: {
                    name: item.geomaster_name,
                    value: Number(item.individuals)
                },
                geometry: {
                    type: "Point",
                    coordinates: [item.centroid_lon, item.centroid_lat]
                }
            };
    
            // Add the feature to the collection
            featureCollection.features.push(feature);
    
            // Update the maximum value if necessary
            if (feature.properties.value > maxValue) {
                maxValue = feature.properties.value;
            }
        });
    
        // Store the processed data and max value in the layerData object
        this.layerData[layerId].data = featureCollection;
        this.layerData[layerId].maxVal = maxValue;
    
        // Add the GeoJSON data to the map as a source if it doesn't exist, or update it if it does
        if (this.map.getSource(layerId)) {
            this.map.getSource(layerId).setData(featureCollection);
        } else {
            this.map.addSource(layerId, {
                type: 'geojson',
                data: featureCollection,
                cluster: true, // Enable clustering
                clusterMaxZoom: 14, // Max zoom level to cluster points
                clusterRadius: 50 // Radius of each cluster
            });
        }
    
        // Now that the data is loaded, we can add or update the layer on the map
        this.addOrUpdateLayer(layerId);
    },
    
    addOrUpdateLayer: function(layerId) {
        let layerData = this.layerData[layerId];
    
        // Check if clustering is enabled for this layer
        let isClustered = this.map.getSource(layerId) && this.map.getSource(layerId)._options.cluster;
    
        if (isClustered) {
            // Handle cluster layers
            this.addClusterLayers(layerId);
        } else {

        }
    },
    
    addClusterLayers: function(layerId) {
        let layerData = this.layerData[layerId];
    
        // Define conditional expression for cluster color dynamically
        let clusterColorExpression = [
            'step',
            ['get', 'point_count'],
            layerId === 'ref' ? '#EF4A60' : '#00B398', 100, // Color for clusters with up to 100 points
            '#f1f075', 750, // Color for clusters with up to 750 points
            '#f28cb1' // Color for clusters with more than 750 points
        ];
    
        // Define the paint properties for the cluster circles
        let paintPropsForClusters = {
            'circle-color': clusterColorExpression,
            'circle-radius': [
                'step',
                ['get', 'point_count'],
                25, // Base radius for clusters with a small number of points
                100, 30, // Radius for clusters with up to 100 points
                750, 40 // Radius for clusters with more than 750 points
            ],
            'circle-opacity': 0.4,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
            'circle-stroke-opacity': 1
        };
    
        // Add a layer for the clusters using the defined paint properties
        this.map.addLayer({
            id: `${layerId}-clusters`,
            type: 'circle',
            source: layerId,
            filter: ['has', 'point_count'], // This filter ensures the layer only applies to clustered points
            paint: paintPropsForClusters
        });
    
        // Add a layer for cluster counts
        this.map.addLayer({
            id: `${layerId}-cluster-count`,
            type: 'symbol',
            source: layerId,
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                'text-size': 12,
                'text-color': '#ffff'
            }
        });

        // Setup for individual points, now with dynamic styling based on 'value'
        let individualPointColorExpression = [
            'match',
            ['get', 'name'], // Checking the 'name' property
            'Bhasan Char', '#0072BC', // Specific color for 'Bhasan Char'
            layerId === 'ref' ? '#EF4A60' : '#00B398' // Default color based on layerId
        ];

        let individualPointSizeExpression = [
            'interpolate', ['linear'], ['get', 'value'],
            0, 4, // Minimum size
            this.layerData[layerId].maxVal, 15 // Size increases with the value, up to a maximum size
        ];

        // Define paint properties for individual points
        let paintPropsForIndividualPoints = {
            'circle-color': individualPointColorExpression,
            'circle-radius': individualPointSizeExpression,
            'circle-opacity': 0.8,
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 1
        };        

        // Add a layer for individual points
        if (this.map.getLayer(`${layerId}-unclustered-point`)) {
            this.map.setPaintProperty(`${layerId}-unclustered-point`, 'circle-color', individualPointColorExpression);
            this.map.setPaintProperty(`${layerId}-unclustered-point`, 'circle-radius', individualPointSizeExpression);
        } else {
            this.map.addLayer({
                id: `${layerId}-unclustered-point`,
                type: 'circle',
                source: layerId,
                filter: ['!', ['has', 'point_count']], // This ensures we're dealing with individual points, not clusters
                paint: paintPropsForIndividualPoints
            });
        }
    },    

    setupLayerSwitchers: function() {
        $('#layerSwitcher input[type="checkbox"]').change(event => {
            this.updateLayers();
        });
    },

    updateLayers: function() {
        // Iterate over each layer defined in the layerData
        Object.keys(this.layerData).forEach(layerId => {
            // Check if the corresponding checkbox is checked
            let isChecked = $(`#${layerId}`).is(':checked');
    
            // If the layer exists on the map, update its visibility
            if (this.map.getLayer(layerId)) {
                this.map.setLayoutProperty(layerId, 'visibility', isChecked ? 'visible' : 'none');
            }
        });
    
        // Optionally, adjust the map view or perform other actions when layers are toggled
        this.adjustMapViewBasedOnVisibleLayers();
    },
    
    adjustMapViewBasedOnVisibleLayers: function() {
        let bounds = new mapboxgl.LngLatBounds();
    
        // Iterate over each layer to check visibility and aggregate bounds
        Object.keys(this.layerData).forEach(layerId => {
            let isVisible = this.map.getLayoutProperty(layerId, 'visibility') === 'visible';
    
            if (isVisible && this.layerData[layerId].data) {
                // Go through each feature in the layer's data to extend the bounds
                this.layerData[layerId].data.features.forEach(feature => {
                    if (feature.geometry.type === 'Point') {
                        bounds.extend(feature.geometry.coordinates);
                    }
                    // For other geometry types (e.g., Polygon), you might need to iterate through all coordinates
                });
            }
        });
    
        // Check if bounds are valid (i.e., they have been extended at least once)
        if (bounds.isEmpty()) {
            return; // No visible layers or no features to fit to, so we don't change the view
        }
    
        // Adjust the map view to the calculated bounds with padding
        this.map.fitBounds(bounds, {
            padding: 20, // Adjust padding as needed
            animate: true, // Smoothly animate to the new bounds
            maxZoom: 15 // Prevent the map from zooming in too far
        });
    },
    
    // 
    initializePopups: function() {
        // Create a single popup instance to be reused
        this.popup = new mapboxgl.Popup({
            closeButton: false,
            closeOnClick: false
        });

        // Initialize popups for each layer that requires them
        //this.setupPopupForLayer('ref_bhasan', '#00B398', 'Refugee Population 1');
        this.setupPopupForLayer('ref', '#EF4A60', 'Refugee Population');

        // Setup popup for the warehouses layer
        var self = this; // Reference to the MapApp object for use in closures
        this.map.on('click', 'warehouses', function(e) {
            // Ensure that at least one feature was clicked
            if (e.features.length > 0) {
                var feature = e.features[0];
                
                // Define the popup content
                var description = `<h3>${feature.properties.name}</h3>`; // Adjust as needed
                
                // Create and display the popup
                new mapboxgl.Popup()
                    .setLngLat(feature.geometry.coordinates)
                    .setHTML(description)
                    .addTo(self.map);
            }
        });
    
        // Change the cursor to a pointer when hovering over the warehouses layer
        this.map.on('mouseenter', 'warehouses', function() {
            self.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', 'warehouses', function() {
            self.map.getCanvas().style.cursor = '';
        });
    },

    setupPopupForLayer: function(layerId, defaultColor, label) {
        this.map.on('click', `${layerId}-unclustered-point`, (e) => {
            var coordinates = e.features[0].geometry.coordinates.slice();
            var color = e.features[0].properties.name === 'Bhasan Char' ? '#0072BC' : defaultColor;
            var description = `<b>${e.features[0].properties.name}</b><br><b style="color:${color}">${this.numberWithCommas(e.features[0].properties.value)}</b> ${label}`;
    
            // Ensure the popup points to the correct location
            while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
            }
    
            // Create and show the popup
            new mapboxgl.Popup()
                .setLngLat(coordinates)
                .setHTML(description)
                .addTo(this.map);
        });
    
        // Change cursor to pointer on mouse enter for both clustered and unclustered points
        this.map.on('mouseenter', `${layerId}-unclustered-point`, () => {
            this.map.getCanvas().style.cursor = 'pointer';
        });
        this.map.on('mouseleave', `${layerId}-unclustered-point`, () => {
            this.map.getCanvas().style.cursor = '';
        });
    },
    
    // Utility function to format numbers with commas
    numberWithCommas: function(x) {
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    loadAllCSVs: function() {
        const csvFiles = [
            { path: './data/BGD_marker_warehouse_p_unhcr.csv.csv', lonIndex: 10, latIndex: 11, nameIndex: 2, dataKey: 'warehousesData' },
            { path: './data/BGD_prp_p_unhcr_PoC.csv.csv', lonIndex: 12, latIndex: 13, nameIndex: 2, dataKey: 'pocData' },
            { path: './data/BGD_marker_presence_p_unhcr.csv.csv', lonIndex: 14, latIndex: 15, nameIndex: 2, dataKey: 'presenceData' }
        ];
    
        csvFiles.forEach(file => {
            fetch(file.path)
                .then(response => response.text())
                .then(csvText => {
                    this[file.dataKey] = this.csvToGeoJSON(csvText, file.lonIndex, file.latIndex, file.nameIndex);
                })
                .catch(error => console.error('Error loading CSV:', error));
        });
    },

    csvToGeoJSON: function(csvText, lonIndex, latIndex, nameIndex) {
        // Split the CSV text into lines
        const lines = csvText.trim().split('\n');
        // Prepare an empty GeoJSON FeatureCollection object
        const geoJSON = {
            type: 'FeatureCollection',
            features: []
        };
    
        // Skip the header line (i.e., start from index 1) and iterate over each line
        for (let i = 1; i < lines.length; i++) {
            const columns = lines[i].split(',');
    
            // Ensure that the row has enough columns
            if (columns.length > Math.max(lonIndex, latIndex, nameIndex)) {
                const longitude = parseFloat(columns[lonIndex]);
                const latitude = parseFloat(columns[latIndex]);
                const name = columns[nameIndex];
    
                // Only add the feature if longitude and latitude are valid numbers
                if (!isNaN(longitude) && !isNaN(latitude)) {
                    const feature = {
                        type: 'Feature',
                        properties: {
                            name: name // Use the name or adjust this to include other properties as needed
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: [longitude, latitude]
                        }
                    };
                    geoJSON.features.push(feature);
                }
            }
        }
    
        return geoJSON;
    },
    

    loadAllImages: function() {
        const images = [
            { id: 'warehouse-icon', path: './icons/warehouse-icon.png' },
            { id: 'poc-icon', path: './icons/poc-icon.png' },
            { id: 'presence-icon', path: './icons/presence-icon.png' }
        ];
    
        images.forEach(img => {
            this.map.loadImage(img.path, (error, image) => {
                if (error) throw error;
                this.map.addImage(img.id, image);
            });
        });
    },

    addAllLayers: function() {
        // Ensure all data is loaded before adding layers
        Promise.all([
            this.loadDataPromise('./data/BGD_marker_warehouse_p_unhcr.csv.csv', 10, 11, 2),
            this.loadDataPromise('./data/BGD_prp_p_unhcr_PoC.csv.csv', 12, 13, 2),
            this.loadDataPromise('./data/BGD_marker_presence_p_unhcr.csv.csv', 14, 15, 2)
        ]).then(([warehousesData, pocData, presenceData]) => {
            // Conditionally add layers based on checkbox state
            this.addLayerForData(warehousesData, 'warehouses', 'warehouse-icon', $('#warehouses').is(':checked'));
            this.addLayerForData(pocData, 'poc-layer', 'poc-icon', $('#poc-layer').is(':checked'));
            this.addLayerForData(presenceData, 'presence-layer', 'presence-icon', $('#presence-layer').is(':checked'));
        }).catch(error => {
            console.error('Error loading data for layers:', error);
        });
    },    
    
    loadDataPromise: function(filePath, lonIndex, latIndex, nameIndex) {
        return new Promise((resolve, reject) => {
            fetch(filePath)
                .then(response => response.text())
                .then(csvText => {
                    const geoJSONData = this.csvToGeoJSON(csvText, lonIndex, latIndex, nameIndex);
                    resolve(geoJSONData);
                })
                .catch(error => reject(error));
        });
    },

    addLayerForData: function(geoJSONData, layerId, iconId, isVisible) {
        // Add or update source
        if (!this.map.getSource(layerId)) {
            this.map.addSource(layerId, { type: 'geojson', data: geoJSONData });
        } else {
            this.map.getSource(layerId).setData(geoJSONData);
        }
    
        // Add or update layer with visibility handled elsewhere
        if (!this.map.getLayer(layerId)) {
            this.map.addLayer({
                id: layerId,
                type: 'symbol',
                source: layerId,
                layout: { 'icon-image': iconId, 'icon-allow-overlap': true }
            });
            // Check if the layer has been added and then set visibility
            if (this.map.getLayer(layerId)) {
                this.map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none');
            }
        }
    },    
    
    // Add more utility functions as needed...
};

// After the map and layers have been initialized
$(document).ready(function() {
    MapApp.initializeMap();
    MapApp.initializePopups();

    // Ensure all layers are added and initial visibility is set
    MapApp.addAllLayers();

    // Listen for changes in checkbox states and update layer visibility accordingly
    $('#layerSwitcher input[type="checkbox"]').on('change', function() {
        var layerId = $(this).attr('id');
        var isChecked = $(this).is(':checked');

        // Check if the corresponding layer exists
        if (MapApp.map.getLayer(layerId)) {
            // Set the layer visibility based on the checkbox state
            MapApp.map.setLayoutProperty(layerId, 'visibility', isChecked ? 'visible' : 'none');
        }
    });
});

