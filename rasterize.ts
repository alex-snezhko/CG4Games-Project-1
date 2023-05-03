var vec3: any;
var mat4: any;
/* GLOBAL CONSTANTS AND VARIABLES */

const defaultEye = vec3.fromValues(0, 0, 6); // default eye position in world space
// const defaultCenter = vec3.fromValues(0,0,0); // default view direction in world space
const defaultLookAt = vec3.fromValues(0,0,-1); // default view direction in world space
const defaultUp = vec3.fromValues(0,1,0); // default view up vector
const lightAmbient = vec3.fromValues(1,1,1); // default light ambient emission
const lightDiffuse = vec3.fromValues(1,1,1); // default light diffuse emission
const lightSpecular = vec3.fromValues(1,1,1); // default light specular emission
let lightPosition = vec3.fromValues(2,50,20); // default light position

/* input model data */
let gl: WebGLRenderingContext; // the all powerful gl object. It's all here folks!

type v2 = [number, number];
type v3 = [number, number, number];
type Triangle = [v3, v3, v3];
type Square = [v3, v3, v3, v3];

interface Material {
    ambient: v3,
    diffuse: v3,
    specular: v3,
    n: number,
    texture: WebGLTexture | null,
}

interface WebGLTriangleBuffers {
    vertsBuf: WebGLBuffer;
    normsBuf: WebGLBuffer;
    uvsBuf: WebGLBuffer;
    trisBuf: WebGLBuffer;
    numTris: number;
    material: Material;
}

let allBuffers: Record<ModelName, WebGLTriangleBuffers | null> = { teapot: null, plane: null, person: null };

/* shader parameter locations */
let vPosAttribLoc: number; // where to put position for vertex shader
let vNormAttribLoc: number; // where to put normal for vertex shader
let vUVAttribLoc: number; // where to put uv for vertex shader

let eyePositionULoc: WebGLUniformLocation;
let lightAmbientULoc: WebGLUniformLocation;
let lightDiffuseULoc: WebGLUniformLocation;
let lightSpecularULoc: WebGLUniformLocation;
let lightPositionULoc: WebGLUniformLocation;
let mMatrixULoc: WebGLUniformLocation; // where to put model matrix for vertex shader
let pvmMatrixULoc: WebGLUniformLocation; // where to put project model view matrix for vertex shader
let ambientULoc: WebGLUniformLocation; // where to put ambient reflecivity for fragment shader
let diffuseULoc: WebGLUniformLocation; // where to put diffuse reflecivity for fragment shader
let specularULoc: WebGLUniformLocation; // where to put specular reflecivity for fragment shader
let shininessULoc: WebGLUniformLocation; // where to put specular exponent for fragment shader
let firstPassULoc: WebGLUniformLocation; // where to put using texture boolean for fragment shader
let depthTexULoc: WebGLUniformLocation; // where to put texture for fragment shader

let drawingOffsetULoc: WebGLUniformLocation;
let drawingOffsetTexture: WebGLTexture;
let pencilTextureULoc: WebGLUniformLocation;
let pencilTexture: WebGLTexture;

let randomValULoc: WebGLUniformLocation;

let vPaperPosAttribLoc: number;
let paperTexULoc: WebGLUniformLocation;
let paperTexture: WebGLTexture;
let paperRandomValXULoc: WebGLUniformLocation;
let paperRandomValYULoc: WebGLUniformLocation;

let mainProgram: WebGLProgram;
let paperProgram: WebGLProgram;

/* interaction variables */
let Eye: v3 = vec3.clone(defaultEye); // eye position in world space
// let Center: v3 = vec3.clone(defaultCenter); // view direction in world space
let LookAt: v3 = vec3.clone(defaultLookAt);
let Up: v3 = vec3.clone(defaultUp); // view up vector in world space
let eyeYAngle: number = 0;

type MoveMode = "free-rotate" | "continous-rotate" | "move";
let moveMode: MoveMode = "free-rotate";
const allMoveModes = ["free-rotate", "continous-rotate", "move"] as MoveMode[];

type ModelName = "teapot" | "plane" | "person";
let selectedModel: ModelName = "teapot";
const allModels = ["teapot", "plane", "person"] as ModelName[];

type ShadingMode = "blinn-phong" | "cel-shading" | "pencil-sketch";
let selectedShading: ShadingMode = "pencil-sketch";
const allShadingModes = ["blinn-phong", "cel-shading", "pencil-sketch"] as ShadingMode[];

// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url: string, descr: string) {
    try {
        const httpReq = new XMLHttpRequest(); // a new http request
        httpReq.open("GET",url,false); // init the request
        httpReq.send(null); // send the request
        const startTime = Date.now();
        while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
            if ((Date.now()-startTime) > 3000)
                break;
        } // until its loaded or we time out after three seconds
        if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
            throw "Unable to open "+descr+" file!";
        else
            return JSON.parse(httpReq.response); 
    } // end try    
    
    catch(e) {
        console.log(e);
    }
} // end get input spheres

// does stuff when keys are pressed
function handleKeyDown(event: KeyboardEvent) {
    if (moveMode === "move") {
        // set up needed view params
        const rotateDelta = 0.06; // how much to displace view with each key press
        const moveDelta = 0.5;
        const temp = vec3.create(); // lookat, right & temp vectors
        const viewRight = vec3.normalize(vec3.create(),vec3.cross(temp, LookAt, Up)); // get view right vector

        switch (event.code) {
            case "ArrowRight": // select next triangle set
            case "KeyD":
                if (!event.getModifierState("Shift")) {
                    vec3.add(Eye, Eye, vec3.scale(temp,viewRight,-moveDelta));
                } else {
                    vec3.add(LookAt, LookAt, vec3.scale(temp, viewRight, -rotateDelta))
                    vec3.normalize(LookAt, LookAt);
                }
                break;
            case "ArrowLeft": // select previous triangle set
            case "KeyA":
                if (!event.getModifierState("Shift")) {
                    vec3.add(Eye, Eye, vec3.scale(temp,viewRight,moveDelta));
                } else {
                    vec3.add(LookAt, LookAt, vec3.scale(temp, viewRight, rotateDelta))
                    vec3.normalize(LookAt, LookAt);
                }
                break;
            case "ArrowUp": // select next sphere
            case "KeyW":
                vec3.add(Eye, Eye, vec3.scale(temp, LookAt, moveDelta));
                break;
            case "ArrowDown": // select previous sphere
            case "KeyS":
                vec3.add(Eye, Eye, vec3.scale(temp, LookAt, -moveDelta));
                break;
            default:
                break;
        } // end switch
    }

    switch (event.code) {
        case "KeyL":
            vec3.add(lightPosition, lightPosition, vec3.fromValues(-1, 0, 0));
            break;
        case "KeyJ":
            vec3.add(lightPosition, lightPosition, vec3.fromValues(1, 0, 0));
            break;
        case "KeyI":
            vec3.add(lightPosition, lightPosition, vec3.fromValues(0, 0, -1));
            break;
        case "KeyK":
            vec3.add(lightPosition, lightPosition, vec3.fromValues(0, 0, 1));
            break;
        default:
            break;
    } // end switch
} // end handleKeyDown

// set up the webGL environment
function setupWebGL() {
    
    // Set up keys
    document.onkeydown = handleKeyDown; // call this when key pressed

    // create a webgl canvas and set it up
    const webGLCanvas = document.getElementById("myWebGLCanvas")! as HTMLCanvasElement; // create a webgl canvas
    webGLCanvas.addEventListener("mousemove", handleCanvasDrag);
    webGLCanvas.addEventListener("wheel", handleCanvasScroll);
    const glContext = webGLCanvas.getContext("webgl"); // get a webgl object from it
    try {
      if (glContext == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl = glContext;
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
        gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL

// load a texture for the current set or sphere
function loadTexture(textureUrl: string) {
    
    // load a 1x1 gray image into texture for use when no texture, and until texture loads
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture); // activate model's texture
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // invert vertical texcoord v, load gray 1x1
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,new Uint8Array([64, 64, 64, 255]));
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // invert vertical texcoord v
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // use linear filter for magnification
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); // use mipmap for minification
    gl.generateMipmap(gl.TEXTURE_2D); // construct mipmap pyramid
    gl.bindTexture(gl.TEXTURE_2D, null); // deactivate model's texture
    
    const image = new Image(); // new image struct for texture
    image.onload = function () { // when texture image loaded...
        gl.bindTexture(gl.TEXTURE_2D, texture); // activate model's new texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); // norm 2D texture
        gl.generateMipmap(gl.TEXTURE_2D); // rebuild mipmap pyramid
        gl.bindTexture(gl.TEXTURE_2D, null); // deactivate model's new texture
    } // end when texture image loaded
    image.onerror = function () { // when texture image load fails...
        console.log("Unable to load texture " + textureUrl); 
    } // end when texture image load fails
    image.crossOrigin = "Anonymous"; // allow cross origin load, please
    image.src = textureUrl; // set image location
    return texture;
} // end load texture

function loadTextureNoMipmap(textureUrl: string) {
    // load a 1x1 gray image into texture for use when no texture, and until texture loads
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture); // activate model's texture
    // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // invert vertical texcoord v, load gray 1x1
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,new Uint8Array([64, 64, 64, 255]));
    // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // invert vertical texcoord v
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // use linear filter for magnification
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null); // deactivate model's texture
    
    const image = new Image(); // new image struct for texture
    image.onload = function () { // when texture image loaded...
        gl.bindTexture(gl.TEXTURE_2D, texture); // activate model's new texture
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image); // norm 2D texture
        gl.bindTexture(gl.TEXTURE_2D, null); // deactivate model's new texture
    } // end when texture image loaded
    image.onerror = function () { // when texture image load fails...
        console.log("Unable to load texture " + textureUrl); 
    } // end when texture image load fails
    image.crossOrigin = "Anonymous"; // allow cross origin load, please
    image.src = textureUrl; // set image location
    return texture;
} // end load texture

function createBuffers(vertices: v3[], normals: v3[], uvs: v2[], triangles: v3[], material: Material) {
    const flatVerts = vertices.flat();
    const flatNormals = normals.flat();
    const flatUvs = uvs.flat();
    const flatTris = triangles.flat();
    const vertsBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatVerts), gl.STATIC_DRAW);
    const normsBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, normsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatNormals), gl.STATIC_DRAW);
    const uvsBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, uvsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flatUvs), gl.STATIC_DRAW);

    const trisBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, trisBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(flatTris), gl.STATIC_DRAW);

    const numTris = triangles.length;

    const buffers: WebGLTriangleBuffers = { vertsBuf, normsBuf, trisBuf, uvsBuf, numTris, material }
    return buffers;
}

async function loadObjs() {
    // AIRCO DH2 v2 by Joshua Johanson [CC-BY] via Poly Pizza
    const models: [ModelName, string][] = [["teapot", "http://localhost:8000/teapot.obj"], ["plane", "http://localhost:8000/plane.obj"]];
    for (const [model, url] of models) {
        const verts: v3[] = []
        const allNormals: v3[] = []
        const allUvs: v2[] = []
        const allTriVertUvNorms: [v3, v3, v3][] = []
        const res = await fetch(url, { mode: "cors" });
        const contents = await res.text();
        const lines = contents.split("\n");
        for (let line of lines) {
            line = line.trim();
            const words = line.split(/\s+/);
            if (words.length == 0) {
                continue;
            }

            function getV3(strs: string[]) {
                const v3 = strs.map(parseFloat).slice(0, 3) as v3;
                return v3;
            }

            const first = words[0];
            const data = words.slice(1);
            if (first == "v") {
                verts.push(getV3(data));
            } else if (first == "vn") {
                allNormals.push(getV3(data));
            } else if (first == "vt") {
                allUvs.push(data.map(parseFloat).slice(0, 2) as v2);
            } else if (first == "f") {
                const vertUvNormIndexes = data.map(d => d.split("/").map(x => parseInt(x) - 1)) as v3[];
                const numTris = data.length - 2;
                for (let i = 0; i < numTris; i++) {
                    const tri = [vertUvNormIndexes[0], vertUvNormIndexes[i + 1], vertUvNormIndexes[i + 2]] as [v3, v3, v3];
                    allTriVertUvNorms.push(tri);
                }
            }
        }
        const maxY = verts.reduce((max, v) => Math.max(max, v[1]), 0);
        const minY = verts.reduce((min, v) => Math.min(min, v[1]), 0);
        const avgY = (maxY + minY) / 2;
        verts.forEach(v => v[1] -= avgY);

        const norms: v3[] = [];
        const uvs: v2[] = [];
        const tris: v3[] = []
        for (const data of allTriVertUvNorms) {
            for (const [vi, ti, ni] of data) {
                uvs[vi] = allUvs[ti]
                norms[vi] = allNormals[ni]
            }
            const vertIs = data.map(x => x[0]) as v3;
            tris.push(vertIs);
        }

        const material = { ambient: [0.5, 0.5, 0.5], diffuse: [0.3, 0.3, 0.3], specular: [0.2, 0.2, 0.2], n: 2, texture: null } as Material;
        allBuffers[model] = createBuffers(verts, norms, uvs, tris, material);
    }

    const allModelData = allModels.map(m => [m, document.getElementById(m)!] as [ModelName, HTMLElement]);
    allModelData.forEach(([model, elem]) => elem.addEventListener("click", event => {
        allModelData.forEach(([_, elem]) => elem.classList.remove("selected"));
        elem.classList.add("selected");
        selectModel(model);
    }));

    const allMoveModesData = allMoveModes.map(m => [m, document.getElementById(m)!] as [MoveMode, HTMLElement]);
    allMoveModesData.forEach(([moveMode, elem]) => elem.addEventListener("click", event => {
        allMoveModesData.forEach(([_, elem]) => elem.classList.remove("selected"));
        elem.classList.add("selected");
        selectMove(moveMode);
    }));

    const allShadingData = allShadingModes.map(m => [m, document.getElementById(m)!] as [ShadingMode, HTMLElement]);
    allShadingData.forEach(([shading, elem]) => elem.addEventListener("click", event => {
        allShadingData.forEach(([_, elem]) => elem.classList.remove("selected"));
        elem.classList.add("selected");
        selectShadingMode(shading);
    }));
}

function rotateView(ang: number, axis: v3) {
    const rotationMat = mat4.fromRotation(mat4.create(), ang, axis);
    vec3.transformMat4(Eye, Eye, rotationMat);
    vec3.transformMat4(LookAt, LookAt, rotationMat);
    vec3.transformMat4(Up, Up, rotationMat);
}

function handleCanvasDrag(event: MouseEvent) {
    if (event.buttons !== 0 && moveMode === "free-rotate") {
        const dx = event.movementX;
        const dy = event.movementY;
        if (dx !== 0) {
            rotateView(dx / 100, vec3.fromValues(0, 1, 0));
        }
        if (dy !== 0) {
            const rotateAngle = dy / 100;
            const MIN_Y_ANG = -Math.PI / 2;
            const MAX_Y_ANG = Math.PI / 2;
            const newAngle = Math.max(MIN_Y_ANG, Math.min(MAX_Y_ANG, eyeYAngle + rotateAngle));
            rotateView(newAngle - eyeYAngle, vec3.cross(vec3.create(), Up, LookAt));
            eyeYAngle = newAngle;
        }
    }
}

function handleCanvasScroll(event: WheelEvent) {
    if (moveMode !== "move") {
        event.preventDefault();
        const amtToMove = event.deltaY / 100;
        const dist = vec3.length(Eye);
        const MIN_DIST = 2;
        const MAX_DIST = 50;
        const newDist = Math.max(MIN_DIST, Math.min(MAX_DIST, dist + amtToMove));
        vec3.scale(Eye, vec3.normalize(Eye, Eye), newDist);
    }
}

function reset() {
    Eye = vec3.clone(defaultEye);
    LookAt = vec3.clone(defaultLookAt);
    Up = vec3.clone(defaultUp);
    eyeYAngle = 0;
}

function selectMove(mode: MoveMode) {
    moveMode = mode;
    reset();
}

function selectModel(model: ModelName) {
    selectedModel = model;
    reset();
}

function selectShadingMode(shadingMode: ShadingMode) {
    selectedShading = shadingMode;
    setupShaders();
    // reset();
}

function createProgram(vShaderSrc: string, fShaderSrc: string) {
    const fShader = gl.createShader(gl.FRAGMENT_SHADER)!; // create frag shader
    gl.shaderSource(fShader, fShaderSrc); // attach code to shader
    gl.compileShader(fShader); // compile the code for gpu execution

    const vShader = gl.createShader(gl.VERTEX_SHADER)!; // create vertex shader
    gl.shaderSource(vShader, vShaderSrc); // attach code to shader
    gl.compileShader(vShader); // compile the code for gpu execution
        
    if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
        console.log("error during fragment shader compile: " + gl.getShaderInfoLog(fShader));  
        gl.deleteShader(fShader);
    } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
        console.log("error during vertex shader compile: " + gl.getShaderInfoLog(vShader));  
        gl.deleteShader(vShader);
    } else { // no compile errors
        const shaderProgram = gl.createProgram()!; // create the single shader program
        gl.attachShader(shaderProgram, fShader); // put frag shader in program
        gl.attachShader(shaderProgram, vShader); // put vertex shader in program
        gl.linkProgram(shaderProgram); // link program into gl context

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
            console.log("error during shader program linking: " + gl.getProgramInfoLog(shaderProgram));
        } else { // no shader program link errors
            return shaderProgram;
        } // end if no shader program link errors
    } // end if no compile errors
}

function perlinNoise(low: number, high: number) {
    // Perlin noise generation based on https://rtouti.github.io/graphics/perlin-noise-algorithm
    function shuffle(arrayToShuffle: number[]) {
        for(let e = arrayToShuffle.length-1; e > 0; e--) {
            const index = Math.round(Math.random()*(e-1));
            const temp = arrayToShuffle[e];
            
            arrayToShuffle[e] = arrayToShuffle[index];
            arrayToShuffle[index] = temp;
        }
    }

    function makePermutation() {
        const permutation = [];
        for(let i = 0; i < 256; i++) {
            permutation.push(i);
        }

        shuffle(permutation);
        
        for(let i = 0; i < 256; i++) {
            permutation.push(permutation[i]);
        }
        
        return permutation;
    }
    const permutation = makePermutation();

    function getConstantVector(v: number) {
        // v is the value from the permutation table
        const h = v & 3;
        if (h == 0)
            return [1.0, 1.0] as [number, number];
        else if (h == 1)
            return [-1.0, 1.0] as [number, number];
        else if (h == 2)
            return [-1.0, -1.0] as [number, number];
        else
            return [1.0, -1.0] as [number, number];
    }

    function fade(t: number) {
        return ((6 * t - 15) * t + 10) * t * t * t;
    }

    function lerp(t: number, a1: number, a2: number) {
        return a1 + t * (a2 - a1);
    }

    function dot(a: [number, number], b: [number, number]) {
        return a[0] * b[0] + a[1] * b[1];
    }

    function noise2D(x: number, y: number) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;

        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);

        const topRight = [xf - 1.0, yf - 1.0] as [number, number];
        const topLeft = [xf, yf - 1.0] as [number, number];
        const bottomRight = [xf - 1.0, yf] as [number, number];
        const bottomLeft = [xf, yf] as [number, number];
        
        // Select a value from the permutation array for each of the 4 corners
        const valueTopRight = permutation[permutation[X + 1] + Y + 1];
        const valueTopLeft = permutation[permutation[X] + Y + 1];
        const valueBottomRight = permutation[permutation[X + 1] + Y];
        const valueBottomLeft = permutation[permutation[X] + Y];
        
        const dotTopRight = dot(topRight, getConstantVector(valueTopRight));
        const dotTopLeft = dot(topLeft, getConstantVector(valueTopLeft));
        const dotBottomRight = dot(bottomRight, getConstantVector(valueBottomRight));
        const dotBottomLeft = dot(bottomLeft, getConstantVector(valueBottomLeft));
        
        const u = fade(xf);
        const v = fade(yf);
        
        return lerp(u,
            lerp(v, dotBottomLeft, dotTopLeft),
            lerp(v, dotBottomRight, dotTopRight)
        );
    }

    const data: number[] = [];
    for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 512; x++) {
            // in range [-1, 1]
            const n = noise2D(x * 0.08, y * 0.08)

            const mid = (high - low) / 2 + low;
            const variation = high - mid;
            const val = mid + n * variation;
            data.push(val);
        }
    }

    return data;
}

function generatePaper() {
    const perlin = perlinNoise(249, 255);
    const data = perlin.flatMap(c => [c, c, c, 255]);

    const dataArr = new Uint8Array(data);
    paperTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, paperTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataArr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    // define vertex shader in essl using es6 template strings
    const paperVShaderCode = `
        attribute vec2 aPosition;

        varying vec2 vTexCoord;

        void main(void) {
            gl_Position = vec4(aPosition, 0.0, 1.0);
            vTexCoord = aPosition * 0.4 + 0.5;
        }
    `;

    const paperFShaderCode = `
        precision mediump float;

        uniform sampler2D uPaperTexture;
        uniform float uRandomValX;
        uniform float uRandomValY;

        varying vec2 vTexCoord;

        void main(void) {
            gl_FragColor = texture2D(uPaperTexture, vTexCoord + vec2((uRandomValX / 10.0), (uRandomValY / 10.0)));
        }
    `;

    paperProgram = createProgram(paperVShaderCode, paperFShaderCode)!;
            
    // locate and enable vertex attributes
    vPaperPosAttribLoc = gl.getAttribLocation(paperProgram, "aPosition"); // ptr to vertex pos attrib
    gl.enableVertexAttribArray(vPaperPosAttribLoc); // connect attrib to array
    
    paperTexULoc = gl.getUniformLocation(paperProgram, "uPaperTexture")!; // ptr to texture
    paperRandomValXULoc = gl.getUniformLocation(paperProgram, "uRandomValX")!; // ptr to texture
    paperRandomValYULoc = gl.getUniformLocation(paperProgram, "uRandomValY")!; // ptr to texture

    // pencil texture found from https://github.com/ekzhang/sketching/blob/master/textures/texture_128_64_64.png
    pencilTexture = loadTextureNoMipmap("http://localhost:8000/pencil_whole.png");
}

function generateOffsets() {
    const perlinX = perlinNoise(0, 255);
    const perlinY = perlinNoise(0, 255);
    const data = perlinX.flatMap((x, i) => [x, perlinY[i], 0, 0]);

    const dataArr = new Uint8Array(data);
    drawingOffsetTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, drawingOffsetTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, dataArr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
}

// setup the webGL shaders
function setupShaders() {
    
    // define vertex shader in essl using es6 template strings
    const blinnPhongVShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        
        uniform mat4 umMatrix; // the model matrix
        uniform mat4 upvmMatrix; // the project view model matrix
        
        varying vec3 vWorldPos; // interpolated world position of vertex
        varying vec3 vVertexNormal; // interpolated normal for frag shader

        void main(void) {
            
            // vertex position
            vec4 vWorldPos4 = umMatrix * vec4(aVertexPosition, 1.0);
            vWorldPos = vec3(vWorldPos4.x,vWorldPos4.y,vWorldPos4.z);
            gl_Position = upvmMatrix * vec4(aVertexPosition, 1.0);

            // vertex normal (assume no non-uniform scale)
            vec4 vWorldNormal4 = umMatrix * vec4(aVertexNormal, 0.0);
            vVertexNormal = normalize(vec3(vWorldNormal4.x,vWorldNormal4.y,vWorldNormal4.z)); 
        }
    `;
    
    // define fragment shader in essl using es6 template strings
    const blinnPhongFShaderCode = `
        precision mediump float; // set float to medium precision

        // eye location
        uniform vec3 uEyePosition; // the eye's position in world
        
        // light properties
        uniform vec3 uLightAmbient; // the light's ambient color
        uniform vec3 uLightDiffuse; // the light's diffuse color
        uniform vec3 uLightSpecular; // the light's specular color
        uniform vec3 uLightPosition; // the light's position
        
        // material properties
        uniform vec3 uAmbient; // the ambient reflectivity
        uniform vec3 uDiffuse; // the diffuse reflectivity
        uniform vec3 uSpecular; // the specular reflectivity
        uniform float uShininess; // the specular exponent
        
        // geometry properties
        varying vec3 vWorldPos; // world xyz of fragment
        varying vec3 vVertexNormal; // normal of fragment
        
        void main(void) {
        
            // ambient term
            vec3 ambient = uAmbient*uLightAmbient; 
            
            // diffuse term
            vec3 normal = normalize(vVertexNormal); 
            vec3 light = normalize(uLightPosition - vWorldPos);
            float lambert = max(0.0,dot(normal,light));
            vec3 diffuse = uDiffuse*uLightDiffuse*lambert; // diffuse term
            
            // specular term
            vec3 eye = normalize(uEyePosition - vWorldPos);
            vec3 halfVec = normalize(light+eye);
            float highlight = pow(max(0.0,dot(normal,halfVec)),uShininess);
            vec3 specular = uSpecular*uLightSpecular*highlight; // specular term
            
            // combine to find lit color
            vec3 litColor = ambient + diffuse + specular; 
            
            gl_FragColor = vec4(litColor, 1.0);
        } // end main
    `;

    // define vertex shader in essl using es6 template strings
    const celShadingVShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        
        uniform mat4 umMatrix; // the model matrix
        uniform mat4 upvmMatrix; // the project view model matrix
        
        varying vec3 vWorldPos; // interpolated world position of vertex
        varying vec3 vVertexNormal; // interpolated normal for frag shader

        void main(void) {
            
            // vertex position
            vec4 vWorldPos4 = umMatrix * vec4(aVertexPosition, 1.0);
            vWorldPos = vec3(vWorldPos4.x,vWorldPos4.y,vWorldPos4.z);
            gl_Position = upvmMatrix * vec4(aVertexPosition, 1.0);

            // vertex normal (assume no non-uniform scale)
            vec4 vWorldNormal4 = umMatrix * vec4(aVertexNormal, 0.0);
            vVertexNormal = normalize(vec3(vWorldNormal4.x,vWorldNormal4.y,vWorldNormal4.z)); 
        }
    `;

    const celShadingFShaderCode = `
        precision mediump float; // set float to medium precision

        // eye location
        uniform vec3 uEyePosition; // the eye's position in world
        
        // light properties
        uniform vec3 uLightAmbient; // the light's ambient color
        uniform vec3 uLightDiffuse; // the light's diffuse color
        uniform vec3 uLightSpecular; // the light's specular color
        uniform vec3 uLightPosition; // the light's position
        
        // material properties
        uniform vec3 uAmbient; // the ambient reflectivity
        uniform vec3 uDiffuse; // the diffuse reflectivity
        uniform vec3 uSpecular; // the specular reflectivity
        uniform float uShininess; // the specular exponent
        
        // geometry properties
        varying vec3 vWorldPos; // world xyz of fragment
        varying vec3 vVertexNormal; // normal of fragment
        
        void main(void) {
            // diffuse term
            vec3 normal = normalize(vVertexNormal); 
            vec3 light = normalize(uLightPosition - vWorldPos);
            float intensity = max(0.0,dot(normal,light));
            vec4 color;
            if (intensity > 0.95)
                // color = vec4(1.0,0.5,0.5,1.0);
                color = vec4(0.9,0.9,0.9,1.0);
            else if (intensity > 0.5)
                // color = vec4(0.6,0.3,0.3,1.0);
                color = vec4(0.7,0.7,0.7,1.0);
            else if (intensity > 0.25)
                // color = vec4(0.4,0.2,0.2,1.0);
                color = vec4(0.5,0.5,0.5,1.0);
            else
                // color = vec4(0.2,0.1,0.1,1.0);
                color = vec4(0.4,0.4,0.4,1.0);

            gl_FragColor = color;
        } // end main
    `;

    // define vertex shader in essl using es6 template strings
    const pencilShadingVShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        attribute vec2 aVertexUV; // vertex uv
        
        uniform mat4 umMatrix; // the model matrix
        uniform mat4 upvmMatrix; // the project view model matrix
        
        varying vec3 vWorldPos; // interpolated world position of vertex
        varying vec3 vVertexNormal; // interpolated normal for frag shader
        varying vec2 vVertexUV; // interpolated uv for frag shader

        void main(void) {
            
            // vertex position
            vec4 vWorldPos4 = umMatrix * vec4(aVertexPosition, 1.0);
            vWorldPos = vec3(vWorldPos4.x,vWorldPos4.y,vWorldPos4.z);
            gl_Position = upvmMatrix * vec4(aVertexPosition, 1.0);

            // vertex normal (assume no non-uniform scale)
            vec4 vWorldNormal4 = umMatrix * vec4(aVertexNormal, 0.0);
            vVertexNormal = normalize(vec3(vWorldNormal4.x,vWorldNormal4.y,vWorldNormal4.z)); 

            vVertexUV = aVertexUV;
        }
    `;

    const pencilShadingFShaderCode = `
        precision mediump float; // set float to medium precision

        // eye location
        uniform vec3 uEyePosition; // the eye's position in world
        
        // light properties
        uniform vec3 uLightAmbient; // the light's ambient color
        uniform vec3 uLightDiffuse; // the light's diffuse color
        uniform vec3 uLightSpecular; // the light's specular color
        uniform vec3 uLightPosition; // the light's position
        
        // material properties
        uniform vec3 uAmbient; // the ambient reflectivity
        uniform vec3 uDiffuse; // the diffuse reflectivity
        uniform vec3 uSpecular; // the specular reflectivity
        uniform float uShininess; // the specular exponent
        
        // geometry properties
        varying vec3 vWorldPos; // world xyz of fragment
        varying vec3 vVertexNormal; // normal of fragment
        varying vec2 vVertexUV; // uv of fragment
        
        uniform bool uFirstPass;
        uniform sampler2D uDepthTex;

        uniform sampler2D uPencilTexture;

        uniform sampler2D uDrawingOffsetTexture;
        uniform float uRandomVal;

        // kernel taken from https://gist.github.com/Hebali/6ebfc66106459aacee6a9fac029d0115
        void makeKernel(inout vec4 n[9])
        {
            float w = 1.0 / 512.0;
            float h = 1.0 / 512.0;

            vec2 unnormedCoord = gl_FragCoord.xy;

            vec2 coord = unnormedCoord / vec2(512.0, 512.0);

            n[0] = texture2D(uDepthTex, coord + vec2( -w, -h));
            n[1] = texture2D(uDepthTex, coord + vec2(0.0, -h));
            n[2] = texture2D(uDepthTex, coord + vec2(  w, -h));
            n[3] = texture2D(uDepthTex, coord + vec2( -w, 0.0));
            n[4] = texture2D(uDepthTex, coord);
            n[5] = texture2D(uDepthTex, coord + vec2(  w, 0.0));
            n[6] = texture2D(uDepthTex, coord + vec2( -w, h));
            n[7] = texture2D(uDepthTex, coord + vec2(0.0, h));
            n[8] = texture2D(uDepthTex, coord + vec2(  w, h));
        }

        float LinearizeDepth(float depth) 
        {
            float z = depth * 2.0 - 1.0; // back to NDC 
            return (2.0 * 0.1 * 20.0) / (20.0 + 0.1 - z * (20.0 - 0.1));	
        }
        
        void main(void) {
            if (uFirstPass) {
                float depth = LinearizeDepth(gl_FragCoord.z) / 20.0; // divide by far for demonstration
                gl_FragColor = vec4(depth, vVertexNormal);
            } else {
                vec4 n[9];
                makeKernel(n);

                vec4 sobelEdgeH = n[2] + (2.0*n[5]) + n[8] - (n[0] + (2.0*n[3]) + n[6]);
                vec4 sobelEdgeV = n[0] + (2.0*n[1]) + n[2] - (n[6] + (2.0*n[7]) + n[8]);
                vec4 sobel = sqrt((sobelEdgeH * sobelEdgeH) + (sobelEdgeV * sobelEdgeV));

                vec3 normal = normalize(vVertexNormal); 
                vec3 light = normalize(uLightPosition - vWorldPos);
                float intensity = sqrt(max(0.0, dot(normal,light)));

                float x = vVertexUV.s;
                float y = (1.0 - intensity) * 0.89 + (uRandomVal / 40.0);

                vec4 texColor = texture2D(uPencilTexture, vec2(x, y));

                vec3 litColor;
                float depthThresh = 0.05;
                float normThresh = 2.1;
                if (sobel.x > depthThresh || sobel.y > normThresh || sobel.z > normThresh || sobel.w > normThresh) litColor = vec3(0.3, 0.3, 0.3);
                else litColor = vec3(1.0, 1.0, 1.0);

                gl_FragColor = vec4(texColor.rgb * litColor, 1.0);
            }
        } // end main
    `;

    const [vShaderCode, fShaderCode] = ({
        "blinn-phong": [blinnPhongVShaderCode, blinnPhongFShaderCode],
        "cel-shading": [celShadingVShaderCode, celShadingFShaderCode],
        "pencil-sketch": [pencilShadingVShaderCode, pencilShadingFShaderCode],
    } as Record<ShadingMode, [string, string]>)[selectedShading];
    
    mainProgram = createProgram(vShaderCode, fShaderCode)!;
    
    // locate and enable vertex attributes
    vPosAttribLoc = gl.getAttribLocation(mainProgram, "aVertexPosition"); // ptr to vertex pos attrib
    gl.enableVertexAttribArray(vPosAttribLoc); // connect attrib to array
    vNormAttribLoc = gl.getAttribLocation(mainProgram, "aVertexNormal"); // ptr to vertex normal attrib
    gl.enableVertexAttribArray(vNormAttribLoc); // connect attrib to array
    vUVAttribLoc = gl.getAttribLocation(mainProgram, "aVertexUV"); // ptr to vertex uv attrib
    gl.enableVertexAttribArray(vUVAttribLoc); // connect attrib to array
    
    // locate vertex uniforms
    mMatrixULoc = gl.getUniformLocation(mainProgram, "umMatrix")!; // ptr to mmat
    pvmMatrixULoc = gl.getUniformLocation(mainProgram, "upvmMatrix")!; // ptr to pvmmat
    
    // locate fragment uniforms
    eyePositionULoc = gl.getUniformLocation(mainProgram, "uEyePosition")!; // ptr to eye position
    lightAmbientULoc = gl.getUniformLocation(mainProgram, "uLightAmbient")!; // ptr to light ambient
    lightDiffuseULoc = gl.getUniformLocation(mainProgram, "uLightDiffuse")!; // ptr to light diffuse
    lightSpecularULoc = gl.getUniformLocation(mainProgram, "uLightSpecular")!; // ptr to light specular
    lightPositionULoc = gl.getUniformLocation(mainProgram, "uLightPosition")!; // ptr to light position
    ambientULoc = gl.getUniformLocation(mainProgram, "uAmbient")!; // ptr to ambient
    diffuseULoc = gl.getUniformLocation(mainProgram, "uDiffuse")!; // ptr to diffuse
    specularULoc = gl.getUniformLocation(mainProgram, "uSpecular")!; // ptr to specular
    shininessULoc = gl.getUniformLocation(mainProgram, "uShininess")!; // ptr to shininess
    firstPassULoc = gl.getUniformLocation(mainProgram, "uFirstPass")!; // ptr to texture
    depthTexULoc = gl.getUniformLocation(mainProgram, "uDepthTex")!; // ptr to texture
    pencilTextureULoc = gl.getUniformLocation(mainProgram, "uPencilTexture")!;
    drawingOffsetULoc = gl.getUniformLocation(mainProgram, "uDrawingOffsetTexture")!;
    randomValULoc = gl.getUniformLocation(mainProgram, "uRandomVal")!;
} // end setup shaders

function renderScene(mMatrix: any, hpvmMatrix: any) {
    // render each triangle set
    const buffers = allBuffers[selectedModel];

    if (buffers !== null) {
        // make model transform, add to view project
        // makeModelTransform(currSet);
        gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in the m matrix
        gl.uniformMatrix4fv(pvmMatrixULoc, false, hpvmMatrix); // pass in the hpvm matrix
        
        gl.uniform3fv(ambientULoc,buffers.material.ambient); // pass in the ambient reflectivity
        gl.uniform3fv(diffuseULoc,buffers.material.diffuse); // pass in the diffuse reflectivity
        gl.uniform3fv(specularULoc,buffers.material.specular); // pass in the specular reflectivity
        gl.uniform1f(shininessULoc,buffers.material.n); // pass in the specular exponent

        // pass global (not per model) constants into fragment uniforms
        gl.uniform3fv(eyePositionULoc,Eye); // pass in the eye's position
        gl.uniform3fv(lightAmbientULoc,lightAmbient); // pass in the light's ambient emission
        gl.uniform3fv(lightDiffuseULoc,lightDiffuse); // pass in the light's diffuse emission
        gl.uniform3fv(lightSpecularULoc,lightSpecular); // pass in the light's specular emission
        gl.uniform3fv(lightPositionULoc,lightPosition); // pass in the light's position
        
        // position, normal and uv buffers: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertsBuf); // activate position
        gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normsBuf); // activate normal
        gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uvsBuf); // activate normal
        gl.vertexAttribPointer(vUVAttribLoc,2,gl.FLOAT,false,0,0); // feed

        // triangle buffer: activate and render
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.trisBuf); // activate
        gl.drawElements(gl.TRIANGLES,3*buffers.numTris,gl.UNSIGNED_SHORT,0); // render
    }
}

let depthTexture: WebGLTexture;
let fb: WebGLFramebuffer;

function makeFBO() {
    // following https://webglfundamentals.org/webgl/lessons/webgl-render-to-texture.html
    const targetTextureWidth = 512;
    const targetTextureHeight = 512;
    depthTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    
    // define size and format of level 0
    const level = 0;
    const internalFormat = gl.RGBA;
    const border = 0;
    const format = gl.RGBA;
    const type = gl.UNSIGNED_BYTE;
    const data = null;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                    targetTextureWidth, targetTextureHeight, border,
                    format, type, data);
    
    // set the filtering so we don't need mips
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    
    const attachmentPoint = gl.COLOR_ATTACHMENT0;
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, depthTexture, level);

    const depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);

    // make a depth buffer and the same size as the targetTexture
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, targetTextureWidth, targetTextureHeight);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);

    gl.bindTexture(gl.TEXTURE_2D, null);
}

let readyForRerandomize = false;
let randomVal = 0;
let randomVal2 = 0;

// render the loaded model
function renderModels() {
    
    window.requestAnimationFrame(renderModels); // set up frame render callback

    if (readyForRerandomize) {
        readyForRerandomize = false;
        randomVal = Math.random();
        randomVal2 = Math.random();
        return;
    }

    if (moveMode === "continous-rotate") {
        rotateView(0.005, vec3.fromValues(0, 1, 0));
    }

    const hMatrix = mat4.create(); // handedness matrix
    const pMatrix = mat4.create(); // projection matrix
    const vMatrix = mat4.create(); // view matrix
    const mMatrix = mat4.create(); // model matrix
    const hpvMatrix = mat4.create(); // hand * proj * view matrices
    const hpvmMatrix = mat4.create(); // hand * proj * view * model matrices
    // set up handedness, projection and view
    mat4.fromScaling(hMatrix,vec3.fromValues(-1,1,1)); // create handedness matrix
    mat4.perspective(pMatrix,0.5*Math.PI,1,0.1,20); // create projection matrix
    const center = vec3.add(vec3.create(), Eye, LookAt)
    mat4.lookAt(vMatrix,Eye,center,Up); // create view matrix
    mat4.multiply(hpvMatrix,hMatrix,pMatrix); // handedness * projection
    mat4.multiply(hpvMatrix,hpvMatrix,vMatrix); // handedness * projection * view
    mat4.multiply(hpvmMatrix,hpvMatrix,mMatrix); // handedness * project * view * model
    
    // gl.clear(/*gl.COLOR_BUFFER_BIT |*/ gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers
    gl.viewport(0, 0, 512, 512);
    
    if (selectedShading === "pencil-sketch") {
        gl.useProgram(mainProgram); // activate shader program (frag and vert)
        {
            // render to our targetTexture by binding the framebuffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.uniform1i(firstPassULoc, 1);

            renderScene(mMatrix, hpvmMatrix);
        }
        
        gl.useProgram(paperProgram);
        {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.clear(gl.DEPTH_BUFFER_BIT);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, paperTexture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, null);

            gl.uniform1f(paperRandomValXULoc, randomVal);
            gl.uniform1f(paperRandomValYULoc, randomVal2);

            const vertices = [
                -1, -1,
                1, -1,
                -1, 1,
                -1, 1,
                1, -1,
                1, 1
            ];
            const vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
            gl.vertexAttribPointer(vPaperPosAttribLoc, 2, gl.FLOAT, false, 0, 0);

            // triangle buffer: activate and render
            const tris = [0, 1, 2, 3, 4, 5];
            const trisBuf = gl.createBuffer()!;
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, trisBuf);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.STATIC_DRAW);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }

        gl.useProgram(mainProgram); // activate shader program (frag and vert)
        {
            // render to the canvas
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.uniform1i(firstPassULoc, 0);
            gl.clear(gl.DEPTH_BUFFER_BIT);

            gl.activeTexture(gl.TEXTURE0); // bind to active texture 0 (the first)
            gl.bindTexture(gl.TEXTURE_2D, depthTexture);
            gl.uniform1i(depthTexULoc, 0); // pass in the texture and active texture 0

            gl.activeTexture(gl.TEXTURE1); // bind to active texture 0 (the first)
            gl.bindTexture(gl.TEXTURE_2D, pencilTexture);
            gl.uniform1i(pencilTextureULoc, 1); // pass in the texture and active texture 0

            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, drawingOffsetTexture);
            gl.uniform1i(drawingOffsetULoc, 2); // pass in the texture and active texture 0

            gl.uniform1f(randomValULoc, randomVal);

            renderScene(mMatrix, hpvmMatrix);
        }
    } else {
        gl.useProgram(mainProgram); // activate shader program (frag and vert)

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.clear(gl.DEPTH_BUFFER_BIT);
    
        renderScene(mMatrix, hpvmMatrix);
    }

} // end render model


/* MAIN -- HERE is where execution begins after window load */

function main() {
  
    setupWebGL(); // set up the webGL environment
    loadObjs();
    setupShaders(); // setup the webGL shaders
    makeFBO();
    generatePaper();
    generateOffsets();
    renderModels(); // draw the triangles using webGL

    setInterval(() => readyForRerandomize = true, 250)
  
} // end main
