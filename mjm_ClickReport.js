//NOTES:  
//MJM -

define([
  "esri/symbols/SimpleLineSymbol",
  "esri/symbols/SimpleFillSymbol",
  "esri/tasks/BufferParameters",
  "esri/tasks/query",
  "esri/tasks/QueryTask",
  "esri/tasks/IdentifyTask",
  "esri/tasks/IdentifyParameters",
  "esri/SpatialReference",
  "esri/tasks/GeometryService",
  'esri/geometry/webMercatorUtils',
  "dojo/_base/array",
  "dojo/dom",
  "dojo/_base/Color",
  'dojo/dnd/Moveable',  //moveable info window
  'dojo/query',
  'dojo/on',
  'dojo/dom-style',
  'dojo/dom-class'

], function (
  SimpleLineSymbol,
  SimpleFillSymbol,
  BufferParameters,
  Query, QueryTask, IdentifyTask, IdentifyParameters, SpatialReference,
  GeometryService, webMercatorUtils,
  arrayUtils,
  dom,
  Color,
  Moveable,
  dQuery,
  on,
  domStyle,
  domClass

) {

    //Begin Setup - put into config file eventually -----------------------------------------------------------------------------------------------
    clickIdentify = true;  //Toggle to false when using other click widgets (measure) 
    var map;
    var address = ""; //Current address

    //Footer information
    var contactInfo = "<div style='clear:both;'><p><i>All information provided is deemed reliable but is not guaranteed and should be independently verified.</i></p></div>";
    var closeButton = "";  //update depending on popup type (mobile vs desktop)
    var mobileSpacer = "<div style='width:100%; height:10px; padding-bottom:15px;'>&nbsp;</div>";   //blank space to cover up scrolled over text (doesn't cover 100%!!!)
    var candidate_location;  //current candidate location geometry  - location variable for both ESRI geocode and address match location
    //------------------------------------------------------------------------

    //Geometry Service - used to perform the buffer
    gsvc = new GeometryService("https://gis.cityoftacoma.org/arcgis/rest/services/Utilities/Geometry/GeometryServer");

    currentParcel = "";  //Current Parcel
    title = "Historic Properties & Districts";  //Popup title

    //Buffer parcel parameters for additional queries
    paramsBuffer = new BufferParameters();
    paramsBuffer.bufferSpatialReference = new SpatialReference({ wkid: 102100 });
    paramsBuffer.unit = esri.tasks.GeometryService["UNIT_FOOT"];

    //Query layer - parcel (base)
    var qtparcel = new QueryTask("https://gis.cityoftacoma.org/arcgis/rest/services/PDS/DARTparcels_PUBLIC/MapServer/3");
    var qparcel = new Query();
    qparcel.returnGeometry = true;
    qparcel.outFields = ["TaxParcelNumber", "Site_Address"];  //return fields

    //Create identify tasks and setup parameters
    identifyTask = new IdentifyTask("https://gis.cityoftacoma.org/arcgis/rest/services/PDS/H_Register/MapServer/");
    identifyParams = new IdentifyParameters();
    identifyParams.tolerance = 3;
    identifyParams.returnGeometry = true;
    identifyParams.layerIds = [0, 1, 2];
    identifyParams.layerOption = IdentifyParameters.LAYER_OPTION_ALL;
    ;

    //Parcel symbol
    var symbolParcel = new SimpleFillSymbol(
      SimpleFillSymbol.STYLE_NULL,
      new SimpleLineSymbol(
        SimpleLineSymbol.STYLE_SHORTDASHDOTDOT,
        new Color([255, 0, 0]),
        2
      ), new Color([255, 255, 0, 0.25])
    );
    //END Setup------------------------------------------------------------------------------------------------------------------

    var mjm_ClickReportFunctions = {

      newReport: function (currentMap, mapClick, SR) {
        map = currentMap;  //update map & close button
        candidate_location = mapClick; //reset for popup window 
        paramsBuffer.outSpatialReference = SR; //Update SR 

        //Make map's infoWindow draggable/moveable if not a mobile popup (https://jsfiddle.net/gavinr/cu8wL3b0/light/)-----------------------------------------
        //Determine if desktop or mobile popup being used
        if (map.infoWindow.domNode.className != "esriPopupMobile") {
          closeButton = "<div style='float:right;'><button dojoType='dijit/form/Button' type='button' onClick=\"document.getElementsByClassName('titleButton close')[0].click();\"><b>Close</b></button><br>&nbsp;</div>";
          var handle = dQuery(".title", map.infoWindow.domNode)[0];
          var dnd = new Moveable(map.infoWindow.domNode, {
            handle: handle
          });

          //When infoWindow moved, hide pointer arrow:
          on(dnd, 'FirstMove', function () {
            theNodes = [".outerPointer", ".pointer"];  // hide pointer and outerpointer (used depending on where the pointer is shown)
            arrayUtils.forEach(theNodes, function (theNode) {
              var arrowNode = dQuery(theNode, map.infoWindow.domNode)[0];
              if (domStyle.get(arrowNode, "display") === "block") {
                domStyle.set(arrowNode, "display", "none");
                //Reset infoWindow (put back pointer) when closed
                var closeReset = dQuery(".titleButton.close", map.infoWindow.domNode)[0];
                on(closeReset, 'click', function () {
                  domStyle.set(arrowNode, "display", "");  //reset - blank will let it rebuild correctly on next open
                }.bind(this));
              };
            });

          }.bind(this));
        } else {
          //Mobile popup
          closeButton = ""; //Don't use close button
          if (dQuery(".titleButton.arrow.hidden", map.infoWindow.domNode)[0] !== undefined) {
            //https://dojotoolkit.org/reference-guide/1.7/dojo/replaceClass.html
            domClass.replace(dQuery(".titleButton.arrow.hidden", map.infoWindow.domNode)[0], "", "hidden");  //Update mobile popup node class removing 'hidden'
          }
        } //end mobile popup check
        //---------------------------------------------------------------------------------------------------

        if (clickIdentify) {
          //Only do if other click widgets (measure) are not being used
          this.executeQueries(mapClick);  //need to be consistent with geocoders (sends map point)  
        }
      },

      executeQueries: function (e) {
        this.cleanUp();
        qparcel.geometry = e;  // use the map click, geocode, or device location for the query geometry
        qtparcel.execute(qparcel, this.handleQueryParcel);  //query for a parcel at location
      },

      cleanUp: function () {
        map.graphics.clear(); //remove all graphics - buffer and points
        if (map.infoWindow.isShowing) {
          map.infoWindow.hide(); //Close existing popups
        }
      },

      fixNulls: function (value) {
        if (value === null) {
          return "None";
        } else {
          return value;
        }
      },

      handleQueryParcel: function (results) {
        currentParcel = "";  //clear out previous results
        parcel = results.features;
        if (parcel.length > 0) {  //Parcel found - update address/parcel info
          currentParcel = parcel[0].attributes["TaxParcelNumber"];
          address = "<div><b>Address:</b> " + parcel[0].attributes["Site_Address"] +
            "<br><b>Parcel " + parcel[0].attributes["TaxParcelNumber"] + ":</b> <a title='Assessor Information Link' href=\"http://epip.co.pierce.wa.us/CFApps/atr/epip/summary.cfm?parcel=" + parcel[0].attributes["TaxParcelNumber"] + "\" target=\"_blank\">" +
            "Assessor</a>&nbsp;<br>&nbsp;</div>" +
            "<div style='clear:both;'></div><span id='messages'></span>";
          address += "<div style='clear:both;' id='messages'></div>"; //place holder id='messages'for the rest of the query info - filled in by deferred functions
          paramsBuffer.geometries = [parcel[0].geometry];   //Use parcel geometry for query - put results into 'messages' div
          paramsBuffer.distances = [-2];  //inside buffer   - fix for narrow parcels like 5003642450
          var bufferedGeometries = gsvc.buffer(paramsBuffer);  //BUFFER the parcel
        } else {   //Not a parcel
          address = "<div id='messages'></div>"; //place holder id='messages'for the rest of the query info - filled in by deferred functions
          paramsBuffer.geometries = [qparcel.geometry];   //Use map click geometry for query - put results into 'messages' div
          paramsBuffer.distances = [2];  //buffer map click point (could alternatively adjust tolerance)
          var bufferedGeometries = gsvc.buffer(paramsBuffer);  //BUFFER the point
        }

        bufferedGeometries.then(function (bufferedGeometries) {  //First Deferred - Parcel buffer results - Now update identify parameters
          identifyParams.geometry = bufferedGeometries[0];  //Query with buffer polygon - use parcel inside buffer or map click point
          identifyParams.width = map.width;
          identifyParams.height = map.height;
          identifyParams.mapExtent = map.extent;

          identifyTask.execute(identifyParams, function (results) {  //Second Deferred (execute) - Query with buffer polygon results
            var r = "";
            var COT_Message = "";
            var theIDistText = "";
            var theDistText = "";
            var theCDistText = "";

            if (results.length > 0) {  //update Results info
              var historicInfo = "<div style='background-color:#E8F2ED;' ><b>HISTORIC STATUS</b></div>";  //Create HISTORIC STATUS section
              arrayUtils.forEach(results, function (resultsRec) { //loop through all records (single or multiple)
                if (resultsRec.layerName == 'Historic Property') {  //may be multiple properties on a parcel - Wright Park
                  historicInfo += "<b>Historic Property:</b> " + resultsRec.feature.attributes["Property Name"] + "<br>";
                  if (resultsRec.feature.attributes["TACOMA"] == "Y") {  //Tacoma Property Register Check
                    theIDistText = "Tacoma";
                  }
                  if (resultsRec.feature.attributes["WASH"] == "Y") {  //Washington State Property Register Check
                    if (theIDistText == "") {
                      theIDistText = "Washington";
                    } else {
                      theIDistText = theIDistText + ", Washington";
                    }
                  }
                  if (resultsRec.feature.attributes["NATIONAL"] == "Y") {  //National Property Register Check
                    if (theIDistText == "") {
                      theIDistText = "National";
                    } else {
                      theIDistText = theIDistText + ", National";
                    }
                  }
                  historicInfo += "<b>Register(s):</b> " + theIDistText + "<br>";  //Add formatted property Historic Register(s)
                  if (resultsRec.feature.attributes["NOMINATION"] !== 'Null') {  //Tacoma Register - Original Nomination Form
                    historicInfo += "<br>&bull; &nbsp;<a title='Original Nomination Form Link' href=\"" + resultsRec.feature.attributes["NOMINATION"] + "\" target=\"_blank\">Tacoma Register Original Nomination</a>";
                  }
                  var linkLatLong = webMercatorUtils.webMercatorToGeographic(candidate_location);    //Convert map click to lat/long for link to Google Street View
                  historicInfo += "<br>&bull; &nbsp;<a href=\"https://wspdsmap.cityoftacoma.org/website/BLUS/StreetView.htm?lat=" + linkLatLong.y + "&lon=" + linkLatLong.x + "\" target=\"_blank\">Street View Photo (Google Maps)</a><br>&nbsp;<br>";
                } else if (resultsRec.layerName == 'Historic District') {  //Even if multiple properties just one district (so no +=)
                  theDistText = "<b>Historic District:</b> " + resultsRec.feature.attributes["D_NAME"] + " (" + resultsRec.feature.attributes["D_REGISTER"] + ")<br>&nbsp;<br>";
                } else if (resultsRec.layerName == 'Historic Register') {
                  if (resultsRec.feature.attributes["CONSERVATI"] == "Y") {  //Conservation District
                    theCDistText = "<b>Conservation District</b><br>&nbsp;<br>";  //Even if multiple properties just one Conservation District (so no +=)
                  }
                }
              });
              COT_Message += historicInfo + theDistText + theCDistText;
            } else {
              COT_Message += "<div style='clear:both;'></div><div><br>Sorry, no historic information found at this location.<br>&nbsp;</div>";
            }

            r = COT_Message + "<div style='clear:both;'><hr color='#ACB1DB'></div>" + contactInfo + closeButton + mobileSpacer;
            dom.byId('messages').innerHTML = r;    //update report message

          }, function (err) {  //Second Deferred Error
            alert("Error in Historic identify: " + err.message);
            console.error("Identify Historic Error: " + err.message);
          });

        }, function (err) {  //First Deferred Error
          alert("Error retrieving parcel results: " + err.message);
          console.error("Parcel Buffer Error: " + err.message);
        });

        //Open info window and update content
        map.infoWindow.setTitle(title);
        var infoDiv = document.createElement("div");
        infoDiv.innerHTML = address;
        map.infoWindow.setContent(infoDiv); //add content details          
        var screenPnt = map.toScreen(candidate_location);  //from map click or geocode
        map.infoWindow.show(screenPnt);  //open popup

        arrayUtils.forEach(parcel, function (feat) {
          feat.setSymbol(symbolParcel);
          map.graphics.add(feat);  // Add the parcel boundary to the map
          map.setExtent(feat._extent.expand(3.0));  //Zoom map to a multiple of parcel extent (map click stays at current zoom level)
        });

        map.centerAt(candidate_location);    //no offset
      } //last function
    }; //end mjm_ClickReportFunctions

    return mjm_ClickReportFunctions;  //Return an object that exposes new functions

  });

