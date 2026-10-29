import unittest
from h3_lab.configuration import validate_configuration


class AdapterFamilyTests(unittest.TestCase):
    def test_declared_image_adapter_is_rejected_by_video_validation(self):
        with self.assertRaisesRegex(ValueError, 'Create Image'):
            validate_configuration({'loras':[{'name':'qwen21/image.safetensors','enabled':True}]}, {})

    def test_legacy_graph_cannot_hide_an_image_adapter(self):
        with self.assertRaisesRegex(ValueError, 'Create Image'):
            validate_configuration({'workflow':{'lora':{'class_type':'LoraLoaderModelOnly','inputs':{'lora_name':'QWEN21\\image.safetensors'}}}}, {})

    def test_disabled_image_adapter_declaration_does_not_block_legacy_video(self):
        validate_configuration({'loras':[{'name':'qwen21/image.safetensors','enabled':False}]}, {})
