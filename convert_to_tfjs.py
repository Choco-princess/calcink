import json
import tables
import numpy as np

def convert_h5_to_tfjs(h5_path, json_path, output_dir):
    with open(json_path, 'r') as f:
        arch = json.load(f)

    # Layer names and expected weights
    layers_ordered = [
        ('conv2d', 'conv2d'),
        ('conv2d_1', 'conv2d_1'),
        ('conv2d_2', 'conv2d_2'),
        ('conv2d_3', 'conv2d_3'),
        ('conv2d_4', 'conv2d_4'),
        ('conv2d_5', 'conv2d_5'),
        ('dense', 'dense'),
        ('dense_1', 'dense_1')
    ]

    weights_entries = []
    binary_bytes = bytearray()

    with tables.open_file(h5_path, 'r') as h5:
        for layer_group_name, layer_name in layers_ordered:
            grp = getattr(h5.root, layer_group_name)
            subgrp = getattr(grp, layer_name)

            # Kernel
            kernel = subgrp['kernel:0'][:]
            kernel_bytes = kernel.astype('<f4').tobytes() # little endian float32
            weights_entries.append({
                'name': f'{layer_name}/kernel',
                'shape': list(kernel.shape),
                'dtype': 'float32'
            })
            binary_bytes.extend(kernel_bytes)

            # Bias
            bias = subgrp['bias:0'][:]
            bias_bytes = bias.astype('<f4').tobytes()
            weights_entries.append({
                'name': f'{layer_name}/bias',
                'shape': list(bias.shape),
                'dtype': 'float32'
            })
            binary_bytes.extend(bias_bytes)

    # Write binary shard
    bin_filename = 'group1-shard1of1.bin'
    with open(f'{output_dir}/{bin_filename}', 'wb') as f:
        f.write(binary_bytes)

    # Build TF.js model.json format
    tfjs_manifest = {
        'format': 'layers-model',
        'generatedBy': 'keras v2.4.0',
        'convertedBy': 'CalcInk Converter',
        'modelTopology': arch,
        'weightsManifest': [
            {
                'paths': [bin_filename],
                'weights': weights_entries
            }
        ]
    }

    with open(f'{output_dir}/model.json', 'w') as f:
        json.dump(tfjs_manifest, f, indent=2)

    print(f"Successfully converted! Binary size: {len(binary_bytes)} bytes.")

if __name__ == '__main__':
    convert_h5_to_tfjs('modelWeight_dataset3.h5', 'model.json', 'public/model')
