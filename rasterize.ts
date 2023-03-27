var vec3: any;
var mat4: any;
/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const INPUT_URL = "https://ncsucg4games.github.io/prog2/"; // location of input files
const INPUT_ROOMS_URL = INPUT_URL + "rooms.json"; // rooms file loc
const INPUT_TRIANGLES_URL = INPUT_URL + "triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = INPUT_URL + "spheres.json"; // spheres file loc
const defaultEye = vec3.fromValues(0, 0, 30); // default eye position in world space
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
let vUVAttribLoc: number; // where to put UV for vertex shader
let mMatrixULoc: WebGLUniformLocation; // where to put model matrix for vertex shader
let pvmMatrixULoc: WebGLUniformLocation; // where to put project model view matrix for vertex shader
let ambientULoc: WebGLUniformLocation; // where to put ambient reflecivity for fragment shader
let diffuseULoc: WebGLUniformLocation; // where to put diffuse reflecivity for fragment shader
let specularULoc: WebGLUniformLocation; // where to put specular reflecivity for fragment shader
let shininessULoc: WebGLUniformLocation; // where to put specular exponent for fragment shader
let usingTextureULoc: WebGLUniformLocation; // where to put using texture boolean for fragment shader
let textureULoc: WebGLUniformLocation; // where to put texture for fragment shader

/* interaction variables */
let Eye: v3 = vec3.clone(defaultEye); // eye position in world space
// let Center: v3 = vec3.clone(defaultCenter); // view direction in world space
let LookAt: v3 = vec3.clone(defaultLookAt);
let Up: v3 = vec3.clone(defaultUp); // view up vector in world space
let eyeYAngle: number = 0;

type MoveMode = "free-rotate" | "continous-rotate" | "move";
let moveMode: MoveMode = "move";
const allMoveModes = ["free-rotate", "continous-rotate", "move"] as MoveMode[];

type ModelName = "teapot" | "plane" | "person";
let selectedModel: ModelName = "teapot";
const allModels = ["teapot", "plane", "person"] as ModelName[];

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
                if (model === "teapot") {
                    const t = v3[1];
                    v3[1] = v3[2];
                    v3[2] = t;
                }
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

// setup the webGL shaders
function setupShaders() {
    
    // define vertex shader in essl using es6 template strings
    const vShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        attribute vec2 aVertexUV; // vertex texture uv
        
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
            
            // vertex uv
            vVertexUV = aVertexUV;
        }
    `;
    
    // define fragment shader in essl using es6 template strings
    const fShaderCode = `
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
        
        // texture properties
        uniform bool uUsingTexture; // if we are using a texture
        uniform sampler2D uTexture; // the texture for the fragment
        varying vec2 vVertexUV; // texture uv of fragment
            
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
            
            if (!uUsingTexture) {
                gl_FragColor = vec4(litColor, 1.0);
            } else {
                vec4 texColor = texture2D(uTexture, vec2(vVertexUV.s, vVertexUV.t));
            
                // gl_FragColor = vec4(texColor.rgb * litColor, texColor.a);
                gl_FragColor = vec4(texColor.rgb * litColor, 1.0);
            } // end if using texture
        } // end main
    `;
    
    try {
        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!; // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        const vShader = gl.createShader(gl.VERTEX_SHADER)!; // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            const shaderProgram = gl.createProgram()!; // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                
                // locate and enable vertex attributes
                vPosAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexPosition"); // ptr to vertex pos attrib
                gl.enableVertexAttribArray(vPosAttribLoc); // connect attrib to array
                vNormAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexNormal"); // ptr to vertex normal attrib
                gl.enableVertexAttribArray(vNormAttribLoc); // connect attrib to array
                vUVAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexUV"); // ptr to vertex UV attrib
                gl.enableVertexAttribArray(vUVAttribLoc); // connect attrib to array
                
                // locate vertex uniforms
                mMatrixULoc = gl.getUniformLocation(shaderProgram, "umMatrix")!; // ptr to mmat
                pvmMatrixULoc = gl.getUniformLocation(shaderProgram, "upvmMatrix")!; // ptr to pvmmat
                
                // locate fragment uniforms
                const eyePositionULoc = gl.getUniformLocation(shaderProgram, "uEyePosition"); // ptr to eye position
                const lightAmbientULoc = gl.getUniformLocation(shaderProgram, "uLightAmbient"); // ptr to light ambient
                const lightDiffuseULoc = gl.getUniformLocation(shaderProgram, "uLightDiffuse"); // ptr to light diffuse
                const lightSpecularULoc = gl.getUniformLocation(shaderProgram, "uLightSpecular"); // ptr to light specular
                const lightPositionULoc = gl.getUniformLocation(shaderProgram, "uLightPosition"); // ptr to light position
                ambientULoc = gl.getUniformLocation(shaderProgram, "uAmbient")!; // ptr to ambient
                diffuseULoc = gl.getUniformLocation(shaderProgram, "uDiffuse")!; // ptr to diffuse
                specularULoc = gl.getUniformLocation(shaderProgram, "uSpecular")!; // ptr to specular
                shininessULoc = gl.getUniformLocation(shaderProgram, "uShininess")!; // ptr to shininess
                usingTextureULoc = gl.getUniformLocation(shaderProgram, "uUsingTexture")!; // ptr to using texture
                textureULoc = gl.getUniformLocation(shaderProgram, "uTexture")!; // ptr to texture
                
                // pass global (not per model) constants into fragment uniforms
                gl.uniform3fv(eyePositionULoc,Eye); // pass in the eye's position
                gl.uniform3fv(lightAmbientULoc,lightAmbient); // pass in the light's ambient emission
                gl.uniform3fv(lightDiffuseULoc,lightDiffuse); // pass in the light's diffuse emission
                gl.uniform3fv(lightSpecularULoc,lightSpecular); // pass in the light's specular emission
                gl.uniform3fv(lightPositionULoc,lightPosition); // pass in the light's position
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

// render the loaded model
function renderModels() {
    if (moveMode === "continous-rotate") {
        rotateView(0.005, vec3.fromValues(0, 1, 0));
    }

    const hMatrix = mat4.create(); // handedness matrix
    const pMatrix = mat4.create(); // projection matrix
    const vMatrix = mat4.create(); // view matrix
    const mMatrix = mat4.create(); // model matrix
    const hpvMatrix = mat4.create(); // hand * proj * view matrices
    const hpvmMatrix = mat4.create(); // hand * proj * view * model matrices
    
    window.requestAnimationFrame(renderModels); // set up frame render callback
    
    gl.clear(/*gl.COLOR_BUFFER_BIT |*/ gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers
    
    // set up handedness, projection and view
    mat4.fromScaling(hMatrix,vec3.fromValues(-1,1,1)); // create handedness matrix
    mat4.perspective(pMatrix,0.5*Math.PI,1,0.1,100); // create projection matrix
    const center = vec3.add(vec3.create(), Eye, LookAt)
    mat4.lookAt(vMatrix,Eye,center,Up); // create view matrix
    mat4.multiply(hpvMatrix,hMatrix,pMatrix); // handedness * projection
    mat4.multiply(hpvMatrix,hpvMatrix,vMatrix); // handedness * projection * view

    // render each triangle set
    const buffers = allBuffers[selectedModel];

    if (buffers !== null) {
        // make model transform, add to view project
        // makeModelTransform(currSet);
        mat4.multiply(hpvmMatrix,hpvMatrix,mMatrix); // handedness * project * view * model
        gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in the m matrix
        gl.uniformMatrix4fv(pvmMatrixULoc, false, hpvmMatrix); // pass in the hpvm matrix
        
        gl.uniform3fv(ambientULoc,buffers.material.ambient); // pass in the ambient reflectivity
        gl.uniform3fv(diffuseULoc,buffers.material.diffuse); // pass in the diffuse reflectivity
        gl.uniform3fv(specularULoc,buffers.material.specular); // pass in the specular reflectivity
        gl.uniform1f(shininessULoc,buffers.material.n); // pass in the specular exponent
        gl.uniform1i(usingTextureULoc, buffers.material.texture !== null ? 1 : 0); // whether the set uses texture
        gl.activeTexture(gl.TEXTURE0); // bind to active texture 0 (the first)
        gl.bindTexture(gl.TEXTURE_2D, buffers.material.texture); // bind the set's texture
        gl.uniform1i(textureULoc, 0); // pass in the texture and active texture 0
        
        // position, normal and uv buffers: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertsBuf); // activate position
        gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.normsBuf); // activate normal
        gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.uvsBuf); // activate uv
        gl.vertexAttribPointer(vUVAttribLoc,2,gl.FLOAT,false,0,0); // feed

        // triangle buffer: activate and render
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.trisBuf); // activate
        gl.drawElements(gl.TRIANGLES,3*buffers.numTris,gl.UNSIGNED_SHORT,0); // render
    }
} // end render model


/* MAIN -- HERE is where execution begins after window load */

function main() {
  
    setupWebGL(); // set up the webGL environment
    loadObjs();
    setupShaders(); // setup the webGL shaders
    renderModels(); // draw the triangles using webGL
  
} // end main
