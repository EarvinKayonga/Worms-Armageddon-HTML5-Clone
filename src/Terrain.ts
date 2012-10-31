///<reference path="Physics.ts"/>
///<reference path="Logger.ts"

/**
 * The terrain class handles the graphical repsentation of the terrain
 * as well as the box2d physic model. Using the map image data the terrain class
 * constructs box2d objects which make up the terrain. It also handles deformations
 */
class Terrain {

    drawingCanvas: HTMLCanvasElement;
    drawingCanvasContext: CanvasRenderingContext2D;
    bufferCanvas: HTMLCanvasElement;
    bufferCanvasContext: CanvasRenderingContext2D;
    world;
    scale;
    groundbodiesList;
    terrainData;

    deformTerrainBatchList = []; //Used to batch the deforms to one draw and one box2d regen

    constructor (canvas, terrainImage, backgroundGradientImage, world, scale) {

        this.world = world;
        this.scale = scale;
        this.groundbodiesList = []; //Used to easly delete all the ground bodies
        this.drawingCanvas = canvas;
        this.drawingCanvasContext = this.drawingCanvas.getContext("2d");

        //Used for increased preformance. Its more effectent to draw one canvas onto another
        //instead of a large pixel buffer array 
        this.bufferCanvas = document.createElement('canvas');
        this.bufferCanvas.width = canvas.width;
        this.bufferCanvas.height = canvas.height;

        this.bufferCanvasContext = this.bufferCanvas.getContext('2d');

        //Using buffer temporialy to get the top line of the gradient image 
        this.bufferCanvasContext.drawImage(backgroundGradientImage, 0, 0, this.bufferCanvas.width, this.bufferCanvas.height);
        var gradientData = this.bufferCanvasContext.getImageData(0, 0, this.bufferCanvas.width, this.bufferCanvas.height).data;
        var gradientColor = " rgb( " + gradientData[0] + "," + gradientData[1] + "," + gradientData[2] + ")";
        this.bufferCanvasContext.clearRect(0, 0, this.bufferCanvas.width, this.bufferCanvas.height);

        //Setups the background gradientcolor using CSS
        this.drawingCanvas.style.background = gradientColor;
        this.drawingCanvas.style.backgroundImage = "url("+ backgroundGradientImage.src + ")";
        this.drawingCanvas.style.backgroundPositionY = "bottom";
        this.drawingCanvas.style.backgroundRepeat = "repeat-x";

        this.bufferCanvasContext.fillStyle = 'rgba(0,0,0,255)'; //Setup alpha colour for cutting out terrain
        this.bufferCanvasContext.drawImage(terrainImage, 0, 0, this.bufferCanvas.width, this.bufferCanvas.height);

        this.terrainData = this.bufferCanvasContext.getImageData(0, 0, this.bufferCanvas.width, this.bufferCanvas.height);
        this.createTerrainPhysics(0, 0, canvas.width, canvas.height, this.terrainData.data, world, scale)

        this.draw();
        this.bufferCanvasContext.globalCompositeOperation = "destination-out"; // Used for cut out circles
          
    }

    // This setup physical bodies from image data 
    createTerrainPhysics(x, y, width, height, data, world, worldScale) {

        width = width * 4; // 4 becase of [r,g,b,a]
        height = height;

        var theAlphaByte = 3;
        var rectWidth = 0;
        var rectheight = 5; // Every 5 lines is used instead of every px line

        var fixDef = new b2FixtureDef;
        fixDef.density = 1.0;
        fixDef.friction = 0.5;
        fixDef.restitution = 0.2;
        fixDef.shape = new b2PolygonShape;

        var bodyDef = new b2BodyDef;
        bodyDef.type = b2Body.b2_staticBody;

        var bodiesCreated = 0;

        // Used to create a single rect out of a series of consecnative solid 
        var makeBlock = function () => {

            fixDef.shape.SetAsBox((rectWidth / worldScale) / 2, (rectheight / worldScale) / 2);
            bodyDef.position.x = ((xPos / 4) - (rectWidth / 2)) / worldScale;
            bodyDef.position.y = ((yPos - rectheight) / worldScale);

          this.groundbodiesList.push(world.CreateBody(bodyDef).CreateFixture(fixDef).GetBody());
          this.groundbodiesList[this.groundbodiesList.length-1].SetUserData("terrain");

        }

        //Loops though the image pixel data, looking
        // for constecative NON-alpha pixels. To create the physical blocks out of
        for (var yPos = y; yPos <= height; yPos += rectheight) {
            rectWidth = 0;

            for (var xPos = x; xPos <= width; xPos += 4) {

                if (data[xPos + (yPos * width) + theAlphaByte] == 255) //if not alpha pixel
                {
                    rectWidth++;

                    //Check if the box spans the full width of the image.
                    if (rectWidth >= this.drawingCanvas.width) {

                        // if so make the box and reset for the next line
                        makeBlock();
                        rectWidth = 0; //reset rect
                    }

                }
                else if (rectWidth > 1) {

                    makeBlock();
                    bodiesCreated++;
                    rectWidth = 0; //reset rect

                }
            }
        }
        Logger.log("Current body count " + bodiesCreated);
    }

    //Adds this deform position to the list so that the deforms 
    //can be batched at the end of the update loop
    addToDeformBatch(x, y, r) {
        this.deformTerrainBatchList.push({ xPos: x, yPos: y, radius: r });
    }

    // This allows the terrain image data to be changed.
    // It then calls for the box2d physic terrain to be reconstructed from the new image
    deformRegionBatch() {

        this.bufferCanvasContext.beginPath();

        var lenghtCache = this.deformTerrainBatchList.length;
        var angle = Math.PI * 2;

        // Draw cut outs of all batched deformations
        for (var i = 0; i < lenghtCache; i++) {
            var tmp = this.deformTerrainBatchList[i];
            this.bufferCanvasContext.arc(tmp.xPos, tmp.yPos, tmp.radius, angle, 0, true);
        }
        this.deformTerrainBatchList = [];

        this.bufferCanvasContext.closePath();
        this.bufferCanvasContext.fill();
        this.terrainData = this.bufferCanvasContext.getImageData(0, 0, this.bufferCanvas.width, this.bufferCanvas.height);
     

        lenghtCache = this.groundbodiesList.length;
        for (var i = 0; i < lenghtCache; i++) {
            this.world.DestroyBody(this.groundbodiesList[i]);
        }
        this.groundbodiesList = [] //clear list

        this.createTerrainPhysics(0, 0, this.bufferCanvas.width, this.bufferCanvas.height, this.terrainData.data, this.world, this.scale);
        this.draw();

        

    }

    update() {

        if (this.deformTerrainBatchList.length > 0) {
            this.deformRegionBatch();
        }

    }

    draw() {
        this.drawingCanvasContext.clearRect(0, 0, this.drawingCanvas.width, this.drawingCanvas.height);

        // Here we draw an off screen buffer canvas onto our on screen one
        // this is more effeicent then drawing a pixel buffer onto the canvas
        this.drawingCanvasContext.drawImage(this.bufferCanvas, 0, -5);
       this.drawingCanvasContext.drawImage(this.bufferCanvas, 2, -6)
    };


}