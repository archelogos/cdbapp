(function() {
    'use strict';

    /***************************************************************************/
    /***************************************************************************/
    /***************************************************************************/
    /**
    * Angular CartoDB Test APP
    */
    var cdbapp = angular.module('cdbapp', []);

    /***************************************************************************/
    /***************************************************************************/
    /***************************************************************************/
    /**
    * Constant APP_CONFIG
    */
    cdbapp.constant('APP_CONFIG',{
        'APP_NAME' : 'cdbapp',
        'APP_VERSION' : '0.1.0',
        'APP_VERSION_NAME' : 'just-talking',
        'LANGUAGES' : {
            'es-ES' : true,
            'en-EN' : true
        },
        'DEBUG_MODE' : false,
        'ERROR_REPORT' : false,
        'REST_URL': 'https://rambo-test.cartodb.com/api/v2/sql?format=geoJson'
        //'REST_URL': 'https://rambo-test.cartodb.com/api/v2/sql?format=SVG'
    });

    /***************************************************************************/
    /***************************************************************************/
    /***************************************************************************/
    /**
    * APP Config
    */
    cdbapp.config(function ($logProvider, APP_CONFIG) {
        // Enable log
        $logProvider.debugEnabled(APP_CONFIG.DEBUG_MODE);
    });

    /***************************************************************************/
    /***************************************************************************/
    /***************************************************************************/
    /**
    * Database connection for MapPoints
    */
    cdbapp.service('MapPoints', MapPoints);

    function MapPoints($http, APP_CONFIG){

        /**
        * @name genericGet
        * @description get MapPoints
        * @param query
        * @return promise, or false
        */
        this.genericGet = function (query){
            if(!query || angular.isUndefined(query))
            return false;

            return $http({
                method: 'GET',
                url: APP_CONFIG.REST_URL+'&q='+query
            }).then();
        };

        /**
        * @name getN
        * @description get N MapPoints
        * @param number of MapPoints
        * @return promise, or false
        */
        this.getN = function (nRows){
            if(!nRows || angular.isUndefined(nRows))
            return false;
            var query = "select * from (select * from public.mnmappluto) __wrapped limit " + nRows;
            return this.genericGet(query);
        };

    }

    /***************************************************************************/
    /***************************************************************************/
    /***************************************************************************/
    /**
    * Shape Component for dynamic Path
    */
    cdbapp.directive('shape', shape);

    function shape ($timeout) {
        var directive =  {
            restrict: 'E',
            link: linkFunc
        };

        return directive;

        function linkFunc (scope, lElement, lAttr) {

            /* Create a shape node with the given settings. */
            var makeNode = function(name, element, settings) {
                var ns = 'http://www.w3.org/2000/svg';
                var node = document.createElementNS(ns, name);
                for (var attribute in settings) {
                    var value = settings[attribute];
                    if (value !== null && value !== null && !attribute.match(/\$/) &&
                    (typeof value !== 'string' || value !== '')) {
                        node.setAttribute(attribute, value);
                    }
                }
                return node;
            };

            /* INIT */

            var path = makeNode('path', lElement, lAttr);
            var newGuy = path.cloneNode(true);
            $timeout(function() {
                lElement.replaceWith(newGuy);
            })
        }
    }

    /***************************************************************************/
    /***************************************************************************/
    /***************************************************************************/
    /**
    * Main Controller
    */
    cdbapp.controller('DataRenderController', DataRenderController);

    function DataRenderController(MapPoints, APP_CONFIG) {
        var vm = this;

        var STATUS_ENUM = {
            ON_HOLD : "ON_HOLD",
            PROCESSING : "PROCESSING",
            SUCCESS : "SUCCESS",
            ERROR : "ERROR"
        };

        // Const: define step of delta to zoom and move
        var kFactor = 0.1;

        vm.status = STATUS_ENUM.ON_HOLD;
        vm.shape = document.getElementsByTagName("svg")[0];
        vm.shapesSVG = [];
        vm.shapesCoords = [];
        vm.attr = "policeprct";
        // nPoints (query)
        vm.nPoints = 200;

        /* INIT */

        /**
        * @name loadMap
        * @description Request data, generate shapes from data and set
        * the correct dimensions for svg element
        */
        var loadMap = function (){

            vm.status = STATUS_ENUM.PROCESSING;

            var mppPromise = MapPoints.getN(vm.nPoints);
            mppPromise.success(function(data){
                vm.featureCollection = data;
                vm.features = vm.featureCollection.features;
                // Generate shapes (paths) from data
                generateShapes();
                // Set the correct dimensions for svg elements
                setDimension();
                vm.status = STATUS_ENUM.SUCCESS;
            });
            mppPromise.error(function(data){
                vm.mapPoints = data;
                vm.status = STATUS_ERROR;
            });

        };

        // First Load
        loadMap();

        /* ./INIT */

        /**
        * @name getMin
        * @description get minX and minY from data points
        * @return array : [xmin, ymin]
        */
        var getMin = function (){
            var minX = vm.shapesCoords[0][0][0];
            var minY = vm.shapesCoords[0][0][1];

            angular.forEach(vm.shapesCoords, function(shapeCoords){
                angular.forEach(shapeCoords, function(coordinates){
                    if(coordinates[0] < minX){
                        minX = coordinates[0];
                    }
                    if(coordinates[1] < minY){
                        minY = coordinates[1];
                    }
                });
            });

            return [minX, minY];
        };

        /**
        * @name getMax
        * @description get maxX and maxY from data points
        * @return array : [xmax, ymax]
        */
        var getMax = function (){
            var maxX = vm.shapesCoords[0][0][0];
            var maxY = vm.shapesCoords[0][0][1];

            angular.forEach(vm.shapesCoords, function(shapeCoords){
                angular.forEach(shapeCoords, function(coordinates){
                    if(coordinates[0] > maxX){
                        maxX = coordinates[0];
                    }
                    if(coordinates[1] > maxY){
                        maxY = coordinates[1];
                    }
                });
            });

            return [maxX, maxY];
        };

        /**
        * @name getDelta
        * @description get AX and AY from min and max
        * @return array : [AX, AY]
        */
        var getDelta = function (){

            var deltaX = Math.abs(Math.abs(vm.max[0]) - Math.abs(vm.min[0]));
            var deltaY = Math.abs(Math.abs(vm.max[1]) - Math.abs(vm.min[1]));

            return[deltaX, deltaY];
        };

        /**
        * @name generateShapes
        * @description generate path elements from data coordinates
        */
        var generateShapes = function (){

            function decimalToHexColor(number){
                var base = "3A4FB7"
                var baseNum = parseInt(base, 16);
                var color = (baseNum+number).toString(16);
                return "#" + color;
            }
            //just for colors
            var interval = Math.random()*10000;

            //iterate over features to get shape coordinates
            for (var i = 0; i < vm.features.length; i++){
                var feature = vm.features[i];
                var attr = feature.properties[vm.attr];
                var multipolygon = feature.geometry.coordinates;
                var polygon = multipolygon[0];
                var shape = polygon[0];
                var svgShape = {};
                //setting color
                svgShape.fill = decimalToHexColor(Math.round(interval*attr));
                //generating d attr for path element from shape coordinates
                svgShape.path = "M" + shape[0][0] + " " + shape[0][1];
                    for (var j = 1; j < shape.length; j++){
                        var coordinates = shape[j];
                        svgShape.path = svgShape.path + " L" + coordinates[0] + " " + coordinates[1];
                    }
                svgShape.path = svgShape.path + " Z";
                //pushing to an array to iterate with ng-repeat in the view
                vm.shapesSVG.push(svgShape);
                vm.shapesCoords.push(shape);
            }
        };

        /**
        * @name setDimension
        * @description sets viewBox attribute from minPoint, maxPoint and Delta
        */
        var setDimension = function (){
            //TODO
            vm.min = getMin();
            vm.max = getMax();
            vm.delta = getDelta();
            vm.shape.setAttribute("viewBox", vm.min[0] + " " + vm.min[1] + " " + vm.delta[0] + " " + vm.delta[1]);
        };

        /**
        * @name zoomIn
        * @description modifies viewBox SVG attr (delta and kFactor)
        */
        vm.zoomIn = function (){
            var initialVB = vm.shape.getAttribute("viewBox");
            var valuesVB = initialVB.split(" ");

            var x = parseFloat(valuesVB[0]);
            var y = parseFloat(valuesVB[1]);
            var width = parseFloat(valuesVB[2]);
            var height = parseFloat(valuesVB[3]);

            width = width - vm.delta[0]*kFactor;
            height = height - vm.delta[1]*kFactor;

            if(width > 0 && height > 0){
                vm.shape.setAttribute("viewBox", x + " " + y + " " + width + " " + height);
            }
        };

        /**
        * @name zoomOut
        * @description modifies viewBox SVG attr (delta and kFactor)
        */
        vm.zoomOut = function (){
            var initialVB = vm.shape.getAttribute("viewBox");
            var valuesVB = initialVB.split(" ");

            var x = parseFloat(valuesVB[0]);
            var y = parseFloat(valuesVB[1]);
            var width = parseFloat(valuesVB[2]);
            var height = parseFloat(valuesVB[3]);

            width = width + vm.delta[0]*kFactor;
            height = height + vm.delta[1]*kFactor;

            vm.shape.setAttribute("viewBox", x + " " + y + " " + width + " " + height);
        };

        /**
        * @name moveUp
        * @description modifies viewBox SVG attr (delta and kFactor)
        */
        vm.moveUp = function (){
            var initialVB = vm.shape.getAttribute("viewBox");
            var valuesVB = initialVB.split(" ");

            var x = parseFloat(valuesVB[0]);
            var y = parseFloat(valuesVB[1]);
            var width = parseFloat(valuesVB[2]);
            var height = parseFloat(valuesVB[3]);

            y = y - vm.delta[1]*kFactor;

            vm.shape.setAttribute("viewBox", x + " " + y + " " + width + " " + height);
        };

        /**
        * @name moveDown
        * @description modifies viewBox SVG attr (delta and kFactor)
        */
        vm.moveDown = function (){
            var initialVB = vm.shape.getAttribute("viewBox");
            var valuesVB = initialVB.split(" ");

            var x = parseFloat(valuesVB[0]);
            var y = parseFloat(valuesVB[1]);
            var width = parseFloat(valuesVB[2]);
            var height = parseFloat(valuesVB[3]);

            y = y + vm.delta[1]*kFactor;

            vm.shape.setAttribute("viewBox", x + " " + y + " " + width + " " + height);
        };

        /**
        * @name moveLeft
        * @description modifies viewBox SVG attr (delta and kFactor)
        */
        vm.moveLeft = function (){
            var initialVB = vm.shape.getAttribute("viewBox");
            var valuesVB = initialVB.split(" ");

            var x = parseFloat(valuesVB[0]);
            var y = parseFloat(valuesVB[1]);
            var width = parseFloat(valuesVB[2]);
            var height = parseFloat(valuesVB[3]);

            x = x - vm.delta[0]*kFactor;

            vm.shape.setAttribute("viewBox", x + " " + y + " " + width + " " + height);
        };

        /**
        * @name moveRight
        * @description modifies viewBox SVG attr (delta and kFactor)
        */
        vm.moveRight = function (){
            var initialVB = vm.shape.getAttribute("viewBox");
            var valuesVB = initialVB.split(" ");

            var x = parseFloat(valuesVB[0]);
            var y = parseFloat(valuesVB[1]);
            var width = parseFloat(valuesVB[2]);
            var height = parseFloat(valuesVB[3]);

            x = x + vm.delta[0]*kFactor;

            vm.shape.setAttribute("viewBox", x + " " + y + " " + width + " " + height);
        };

        /**
        * @name moreData
        * @description requests more points from database
        */
        vm.moreData = function (){
            vm.nPoints = vm.nPoints * 2;
            loadMap();
        };


        vm.render = function (){
            loadMap();
        };

    }

})();
