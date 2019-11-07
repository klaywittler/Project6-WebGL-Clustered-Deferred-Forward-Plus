export default function(params) {
    return `
  #version 100
  precision highp float;
  
  uniform sampler2D u_gbuffers[${params.numGBuffers}];
  uniform sampler2D u_clusterbuffer;
  uniform sampler2D u_lightbuffer;
  
  // Redoing the impl from ForwardPlus to get texel index
  uniform mat4 u_viewMatrix;
  uniform float u_screenW;
  uniform float u_screenH;
  uniform float u_near;
  uniform float u_far;

  int u_slicesX = ${params.slicesX};
  int u_slicesY = ${params.slicesY};
  int u_slicesZ = ${params.slicesZ};
  float height = ceil(float(${params.maxLightsPerCluster} + 1) / 4.0);
  int num_clusters = u_slicesX * u_slicesY * u_slicesZ;
  
  varying vec2 v_uv;

   vec3 applyNormalMap(vec3 geomnor, vec3 normap) {
    normap = normap * 2.0 - 1.0;
    vec3 up = normalize(vec3(0.001, 1, 0.001));
    vec3 surftan = normalize(cross(geomnor, up));
    vec3 surfbinor = cross(geomnor, surftan);
    return normap.y * surftan + normap.x * surfbinor + normap.z * geomnor;
  }

  struct Light {
    vec3 position;
    float radius;
    vec3 color;
  };

  float ExtractFloat(sampler2D texture, int textureWidth, int textureHeight, int index, int component) {
    float u = float(index + 1) / float(textureWidth + 1);
    int pixel = component / 4;
    float v = float(pixel + 1) / float(textureHeight + 1);
    vec4 texel = texture2D(texture, vec2(u, v));
    int pixelComponent = component - pixel * 4;
    if (pixelComponent == 0) {
      return texel[0];
    } else if (pixelComponent == 1) {
      return texel[1];
    } else if (pixelComponent == 2) {
      return texel[2];
    } else if (pixelComponent == 3) {
      return texel[3];
    }
  }

  Light UnpackLight(int index) {
    Light light;
    float u = float(index + 1) / float(${params.numLights + 1});
    vec4 v1 = texture2D(u_lightbuffer, vec2(u, 0.3));
    vec4 v2 = texture2D(u_lightbuffer, vec2(u, 0.6));
    light.position = v1.xyz;

    // LOOK: This extracts the 4th float (radius) of the (index)th light in the buffer
    // Note that this is just an example implementation to extract one float.
    // There are more efficient ways if you need adjacent values
    light.radius = ExtractFloat(u_lightbuffer, ${params.numLights}, 2, index, 3);

    light.color = v2.rgb;
    return light;
  }
  
  // Cubic approximation of gaussian curve so we falloff to exactly 0 at the light radius
  float cubicGaussian(float h) {
    if (h < 1.0) {
      return 0.25 * pow(2.0 - h, 3.0) - pow(1.0 - h, 3.0);
    } else if (h < 2.0) {
      return 0.25 * pow(2.0 - h, 3.0);
    } else {
      return 0.0;
    }
  }

  void main() {
    // TODO: extract data from g buffers and do lighting
     vec4 gb0 = texture2D(u_gbuffers[0], v_uv);
     vec4 gb1 = texture2D(u_gbuffers[1], v_uv);
     //vec4 gb2 = texture2D(u_gbuffers[2], v_uv);
    // vec4 gb3 = texture2D(u_gbuffers[3], v_uv);

    vec3 v_position = gb0.xyz;
    vec3 albedo = gb1.rgb;
    //vec3 normal = gb2.xyz;
    float xy2 = gb0.w * gb0.w + gb1.w * gb1.w;
    vec3 normal = vec3(gb0.w, gb1.w, sqrt(1.0 - xy2));

    vec4 cameraPos = u_viewMatrix * vec4(v_position, 1.0);

    int ix = int(gl_FragCoord.x * float(u_slicesX) / u_screenW);
    int iy = int(gl_FragCoord.y * float(u_slicesY) / u_screenH);
    int iz = int((cameraPos.z - u_near) * float(u_slicesZ) / (u_far - u_near));

    int idx = ix + iy * u_slicesX + iz * u_slicesX * u_slicesY;

    int num_lights = int(ExtractFloat( u_clusterbuffer, num_clusters, ${params.maxLightsPerCluster}, idx, 0));

    vec3 fragColor = vec3(0.0);

    for (int i = 0; i < ${params.numLights}; ++i) {
      if (i >= num_lights) {break;}

      int iL = int(ExtractFloat(u_clusterbuffer, num_clusters, int(height), idx, i+1));
      Light light = UnpackLight(iL);

      float lightDistance = distance(light.position, v_position);
      vec3 L = (light.position - v_position) / lightDistance;

      float lightIntensity = cubicGaussian(2.0 * lightDistance / light.radius);
      float lambertTerm = max(dot(L, normal), 0.0);

      vec3 viewDir = normalize(-v_position);
      vec3 halfDir = normalize(L + viewDir);
      float specAngle = max(dot(halfDir, normal), 0.0);
      float specular = pow(specAngle, 4200.0);

      fragColor += albedo * lambertTerm * light.color * vec3(lightIntensity) + specular*light.color;
    }

    const vec3 ambientLight = vec3(0.025);
    fragColor += albedo * ambientLight;

    gl_FragColor = vec4(fragColor, 1.0);
    
  }
  `;
}